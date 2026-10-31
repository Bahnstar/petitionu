import bcrypt from "bcryptjs"
import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { revokeUnprovenAccountAccess } from "better-auth/db"
import { magicLink } from "better-auth/plugins/magic-link"
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpEffect, HttpRouter, HttpServerRespondable } from "effect/http"
import type { SqlClient } from "effect/sql"
import pg from "pg"
import { AppConfig } from "./Config.ts"
import { markConfirmed } from "./Confirmation.ts"
import { confirmationEmail, type Email, magicLinkEmail, passwordResetEmail } from "./Email.ts"
import { Mailer } from "./Mailer.ts"

export class AuthConfigError extends Schema.TaggedError<AuthConfigError>()("AuthConfigError", {
  message: Schema.String,
}) {}

type PasswordBody = Readonly<Record<string, unknown>>

/**
 * The password and confirmation a request must match: sign-up and reset always send one; a
 * password change is checked when the client sends a confirmation.
 */
const passwordConfirmation = (path: string, body: PasswordBody) => {
  if (path === "/sign-up/email") {
    return { password: body.password, confirmation: body.passwordConfirmation }
  }
  if (
    path === "/reset-password" ||
    (path === "/change-password" && "newPasswordConfirmation" in body)
  ) {
    return { password: body.newPassword, confirmation: body.newPasswordConfirmation }
  }
  return undefined
}

/** Endpoints a link's token signs in through; only the SPA's pages may call them. */
const linkEndpoints = new Set(["/verify-email", "/magic-link/verify"])

/**
 * Whether a request is the app's own `fetch`. A crafted link, or one in user content, arrives as
 * a navigation, an image or from another site, and could sign a browser into the attacker's
 * account. A client that sends no fetch metadata is refused too, as nothing here needs one.
 */
const isAppFetch = (headers: Headers | undefined) =>
  headers?.get("sec-fetch-site") === "same-origin" && headers.get("sec-fetch-dest") === "empty"

/** Origin of the Vite dev server, trusted only when `NODE_ENV=development`. */
export const devOrigin = "http://localhost:5173"

const bcryptCost = 12

// `users.inserted_at`/`updated_at` are `timestamp without time zone` holding UTC. Make `pg`
// (used only by Better Auth) write dates as UTC and read those columns as UTC.
pg.defaults.parseInputDatesAsUTC = true
const timestampWithoutTimeZone = 1114
const pgTypes = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === timestampWithoutTimeZone
      ? (value: string) => new Date(`${value.replace(" ", "T")}Z`)
      : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
}

export const requireSecret = (name: string, value: Option.Option<Redacted.Redacted<string>>) =>
  Option.isSome(value) && Redacted.value(value.value).length >= 32
    ? Effect.succeed(Redacted.value(value.value))
    : Effect.fail(new AuthConfigError({ message: `${name} must be set to at least 32 characters` }))

/** The session behind a request's cookie, as Better Auth stores it. */
export interface AuthSession {
  readonly userId: string
  /** The raw session token; the CSRF token is derived from it. */
  readonly token: string
}

/**
 * The Better Auth instance: email and password, email verification, magic links, password
 * reset, database sessions and rate limits, all stored in the app's Postgres database.
 */
export class Auth extends Context.Service<
  Auth,
  {
    /** Better Auth's web handler for `/api/auth/*`. */
    readonly handler: (request: Request) => Promise<Response>
    /** Resolves the session from request headers; `None` when there is none or it expired. */
    getSession(headers: Headers): Effect.Effect<Option.Option<AuthSession>>
    /**
     * Finishes confirming a user whose email is verified but whose `confirmed_at` isn't set,
     * because `UserConfirmed` failed when they verified. Logs and gives up on failure.
     */
    finishConfirmation(userId: string): Effect.Effect<void>
  }
>()("petitionu/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const secret = yield* requireSecret("BETTER_AUTH_SECRET", config.betterAuthSecret)
      const env = yield* Config.String("NODE_ENV").pipe(Config.withDefault("production"))
      const context = yield* Effect.context<Mailer | SqlClient.SqlClient>()
      // `UserConfirmed` is a reference: read it from the same context the hooks run in.
      const run = <A, E>(effect: Effect.Effect<A, E, Mailer | SqlClient.SqlClient>) =>
        Effect.runPromiseWith(context)(effect)
      const origin = `https://${config.publicHost}`

      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const pool = new pg.Pool({
            connectionString: Redacted.value(config.databaseUrl),
            ssl: config.databaseSsl,
            max: 3,
            types: pgTypes,
          })
          // A connection that drops is replaced on next use; without listeners the error
          // would crash the process. The pool covers idle connections, `connect` the rest.
          const lost = (error: Error) =>
            Effect.runFork(Effect.logWarning("Auth database connection lost", error.message))
          pool.on("error", lost)
          pool.on("connect", (client) => client.on("error", lost))
          return pool
        }),
        (pool) => Effect.promise(() => pool.end()),
      )

      // Mail goes out after the response (`backgroundTasks`), so a reset or magic-link request
      // takes as long for an unknown address as for a known one. Failures are only logged.
      const send = (email: Email) =>
        run(
          Mailer.use((mailer) => mailer.send(email)).pipe(
            Effect.catch((error) =>
              Effect.logWarning("Auth email not sent", {
                subject: email.subject,
                error: error.message,
              }),
            ),
          ),
        )
      const link = (path: string, token: string) => `${path}?token=${encodeURIComponent(token)}`

      // A failure leaves `confirmed_at` unset; `finishConfirmation` retries on the user's next
      // request. Logged, not thrown, so the verification itself still succeeds.
      const finishConfirmation = (userId: string) =>
        markConfirmed(userId).pipe(
          Effect.catchCause((cause) =>
            Effect.logError("Could not finish confirming a user; will retry", { userId, cause }),
          ),
          Effect.provideContext(context),
        )
      const confirmed = (user: { id: string; emailVerified: boolean }) =>
        user.emailVerified ? run(finishConfirmation(user.id)) : Promise.resolve()

      // Runs before a user's first verification. Sign-up needs no proof of the address, so a
      // password and sessions may belong to someone else by now. A browser signed in as the user
      // holds both the password and the emailed link, so it stays and the user keeps the
      // password; other sessions go. Any other click is treated as Better Auth treats a magic
      // link: the password and every session go, and the user sets a new password by reset.
      const revokeUnprovenAccess = async (user: { id: string }, request?: Request) => {
        const context = await auth.$context
        const current =
          request &&
          (await auth.api.getSession({
            headers: request.headers,
            query: { disableRefresh: true },
          }))
        if (current?.user.id !== user.id) {
          const ctx = { context } as Parameters<typeof revokeUnprovenAccountAccess>[0]
          await revokeUnprovenAccountAccess(ctx, user.id)
          return
        }
        const sessions = await context.internalAdapter.listSessions(user.id)
        const others = sessions.filter((session) => session.token !== current.session.token)
        if (others.length > 0) {
          await context.internalAdapter.deleteSessions(others.map((session) => session.token))
        }
      }

      // The user whose password a `/reset-password` request just reset, keyed by request.
      const resetUsers = new WeakMap<Request, { id: string }>()

      const auth = betterAuth({
        appName: "PetitionU",
        baseURL: origin,
        basePath: "/api/auth",
        secret,
        trustedOrigins: env === "development" ? [origin, devOrigin] : [origin],
        database: pool,
        advanced: {
          database: { generateId: "uuid" },
          ipAddress: { ipAddressHeaders: [config.clientIpHeader] },
          // Better Auth skips its origin check when NODE_ENV=test; keep it on everywhere.
          disableOriginCheck: false,
          backgroundTasks: { handler: () => {} },
        },
        user: {
          modelName: "users",
          fields: {
            emailVerified: "email_verified",
            createdAt: "inserted_at",
            updatedAt: "updated_at",
          },
        },
        session: {
          modelName: "session",
          fields: {
            expiresAt: "expires_at",
            createdAt: "created_at",
            updatedAt: "updated_at",
            ipAddress: "ip_address",
            userAgent: "user_agent",
            userId: "user_id",
          },
        },
        account: {
          modelName: "account",
          fields: {
            accountId: "account_id",
            providerId: "provider_id",
            userId: "user_id",
            accessToken: "access_token",
            refreshToken: "refresh_token",
            idToken: "id_token",
            accessTokenExpiresAt: "access_token_expires_at",
            refreshTokenExpiresAt: "refresh_token_expires_at",
            createdAt: "created_at",
            updatedAt: "updated_at",
          },
        },
        verification: {
          modelName: "verification",
          fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
        },
        rateLimit: {
          enabled: true,
          storage: "database",
          modelName: "rate_limit",
          fields: { lastRequest: "last_request" },
          window: 60,
          max: 100,
          customRules: {
            "/sign-in/email": { window: 60, max: 5 },
            "/sign-up/email": { window: 60, max: 5 },
            "/request-password-reset": { window: 60, max: 3 },
            "/reset-password": { window: 60, max: 5 },
            "/sign-in/magic-link": { window: 60, max: 3 },
            "/magic-link/verify": { window: 60, max: 5 },
            "/verify-email": { window: 60, max: 5 },
            "/send-verification-email": { window: 60, max: 3 },
            "/change-password": { window: 60, max: 5 },
          },
        },
        emailAndPassword: {
          enabled: true,
          minPasswordLength: 8,
          // Either of the next two settings would also change how sign-up answers for a
          // registered address; `revokeUnprovenAccess` is what protects unproven sign-ups.
          autoSignIn: true,
          requireEmailVerification: false,
          password: {
            hash: (password) => bcrypt.hash(password, bcryptCost),
            verify: ({ hash, password }) => bcrypt.compare(password, hash),
          },
          resetPasswordTokenExpiresIn: 60 * 60,
          revokeSessionsOnPasswordReset: true,
          sendResetPassword: ({ user, token }) =>
            send(
              passwordResetEmail({
                publicHost: config.publicHost,
                to: user.email,
                path: link("/reset", token),
              }),
            ),
          // A reset proves the user owns the address, so it confirms them.
          onPasswordReset: async ({ user }, request) => {
            if (request) resetUsers.set(request, user)
            if (!user.emailVerified) {
              const ctx = await auth.$context
              await ctx.internalAdapter.updateUser(user.id, { emailVerified: true })
            }
          },
        },
        emailVerification: {
          sendOnSignUp: true,
          sendOnSignIn: false,
          autoSignInAfterVerification: true,
          expiresIn: 60 * 60,
          beforeEmailVerification: revokeUnprovenAccess,
          // Link to the SPA's confirm page, which verifies only when the user clicks Confirm.
          sendVerificationEmail: ({ user, token }) =>
            send(
              confirmationEmail({
                publicHost: config.publicHost,
                to: user.email,
                path: link("/auth/confirm", token),
              }),
            ),
        },
        plugins: [
          magicLink({
            disableSignUp: false,
            expiresIn: 10 * 60,
            storeToken: "hashed",
            // Link to the SPA's magic sign-in page, which signs in only after a click.
            sendMagicLink: ({ email, token }) =>
              send(
                magicLinkEmail({
                  publicHost: config.publicHost,
                  to: email,
                  path: link("/auth/magic", token),
                }),
              ),
          }),
        ],
        databaseHooks: {
          user: {
            create: { after: confirmed },
            update: { after: confirmed },
          },
        },
        hooks: {
          before: createAuthMiddleware(async (ctx) => {
            if (linkEndpoints.has(ctx.path) && !isAppFetch(ctx.headers)) {
              throw new APIError("FORBIDDEN", { message: "Open the link from your email" })
            }
            const confirmation = passwordConfirmation(ctx.path, (ctx.body ?? {}) as PasswordBody)
            if (confirmation && confirmation.password !== confirmation.confirmation) {
              throw new APIError("BAD_REQUEST", {
                message: "Password confirmation does not match",
              })
            }
            // Changing a password always signs out every other session.
            if (ctx.path === "/change-password") {
              return { context: { body: { ...ctx.body, revokeOtherSessions: true } } }
            }
            return
          }),
          // A successful reset signs the user in with a new session (every other one is revoked).
          after: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== "/reset-password" || !ctx.request) return
            const reset = resetUsers.get(ctx.request)
            if (!reset) return
            const user = await ctx.context.internalAdapter.findUserById(reset.id)
            const session = await ctx.context.internalAdapter.createSession(reset.id)
            if (user && session) await setSessionCookie(ctx, { session, user })
          }),
        },
      })

      const getSession = (headers: Headers) =>
        Effect.tryPromise(() => auth.api.getSession({ headers })).pipe(
          Effect.map((result) =>
            result
              ? Option.some({ userId: result.user.id, token: result.session.token })
              : Option.none(),
          ),
          Effect.orDie,
        )

      return Auth.of({ handler: auth.handler, getSession, finishConfirmation })
    }),
  )
}

/** Better Auth's endpoints under `/api/auth/*`, full path kept. */
export const AuthRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    yield* router.add(
      "*",
      "/api/auth/*",
      HttpEffect.fromWebHandler(auth.handler).pipe(Effect.catch(HttpServerRespondable.toResponse)),
    )
  }),
)
