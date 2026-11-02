import { appRequestHeader, appRequestHeaders } from "@petitionu/domain"
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
import {
  accountExistsEmail,
  confirmationEmail,
  type Email,
  magicLinkEmail,
  passwordResetEmail,
} from "./Email.ts"
import { Mailer } from "./Mailer.ts"

export class AuthConfigError extends Schema.TaggedError<AuthConfigError>()("AuthConfigError", {
  message: Schema.String,
}) {}

type PasswordBody = Readonly<Record<string, unknown>>

/** What an endpoint returned: a success's user or a failure's body, as an after-hook sees it. */
type AuthResult = Record<string, unknown> & {
  readonly user?: { readonly id?: string } | null
  readonly body?: { readonly code?: string }
}

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

/** Endpoints a link's token acts on; only the SPA's pages may call them. */
const linkEndpoints = new Set(["/verify-email", "/magic-link/verify"])

/**
 * Whether a request is the app's own `fetch`. A crafted link, or one in user content, arrives as
 * a navigation, an image or from another site, and could sign a browser into the attacker's
 * account. None of those can set a header, and another site's `fetch` with one needs a CORS
 * preflight the server doesn't grant, so the header holds in every browser. Older browsers send
 * no fetch metadata, so `sec-fetch-site` only refuses when it's there.
 */
const isAppFetch = (headers: Headers | undefined) => {
  const site = headers?.get("sec-fetch-site")
  return (
    headers?.get(appRequestHeader) === appRequestHeaders[appRequestHeader] &&
    (site === null || site === "same-origin")
  )
}

/**
 * Signed cookie naming the account whose password this browser last used, at sign-up or at a
 * sign-in refused for an unconfirmed address. It only ever decides whether confirming keeps the
 * password, so it lasts as long as a confirmation link.
 */
const passwordHolderCookie = "__Host-petitionu.password-holder"

const confirmationLifetime = 60 * 60

/** A confirmation refused because it would remove the password; the page warns and retries. */
const confirmRemovesPassword = "CONFIRM_REMOVES_PASSWORD"

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

      // The account named by a `/verify-email` request's password-holder cookie, by request.
      const passwordHolders = new WeakMap<Request, string>()
      const removedPasswords = new WeakSet<Request>()

      // Runs before a user's first verification, and must finish before `email_verified` flips:
      // a sign-in reads the user, then the password, so one that sees the flip can't see the old
      // password. Sign-up doesn't prove the address, so a password may be someone else's. The
      // browser that used it keeps it. Any other click removes it, as a magic link does, after
      // the page has warned the user: the first click is refused without changing anything.
      const revokeUnprovenAccess = async (user: { id: string }, request?: Request) => {
        const context = await auth.$context
        if (request && passwordHolders.get(request) === user.id) {
          await context.internalAdapter.deleteUserSessions(user.id)
          return
        }
        const account = await context.internalAdapter.findCredentialAccount(user.id)
        const accepted = request && new URL(request.url).searchParams.has("removePassword")
        if (account && !accepted) {
          throw new APIError("CONFLICT", {
            code: confirmRemovesPassword,
            message: "Confirming here removes this account's password",
          })
        }
        const ctx = { context } as Parameters<typeof revokeUnprovenAccountAccess>[0]
        await revokeUnprovenAccountAccess(ctx, user.id)
        if (account && request) removedPasswords.add(request)
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
          // An unconfirmed account can't sign in with a password, so nothing can be used during
          // or after a confirmation that takes it away (see `revokeUnprovenAccess`). This also
          // makes sign-up answer a registered address as it answers a new one, so sign-up doesn't
          // reveal who has an account; `onExistingUserSignUp` tells the owner instead.
          autoSignIn: false,
          requireEmailVerification: true,
          onExistingUserSignUp: ({ user }) =>
            send(
              accountExistsEmail({
                publicHost: config.publicHost,
                to: user.email,
                path: "/sign-in",
              }),
            ),
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
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          expiresIn: confirmationLifetime,
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
            if (ctx.path === "/verify-email" && ctx.request) {
              const holder = await ctx.getSignedCookie(passwordHolderCookie, ctx.context.secret)
              if (holder) passwordHolders.set(ctx.request, holder)
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
          after: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned as AuthResult | undefined
            // A sign-up always names the account: a registered address gets a made-up id that
            // matches nobody, so the response doesn't reveal it. A refused sign-in does too, or
            // the new link it sends would remove the password that was just proved.
            const refused =
              ctx.path === "/sign-in/email" && returned?.body?.code === "EMAIL_NOT_VERIFIED"
            const holder = refused
              ? (await ctx.context.internalAdapter.findUserByEmail(String(ctx.body.email)))?.user.id
              : ctx.path === "/sign-up/email" && returned?.user?.id
            if (holder) {
              await ctx.setSignedCookie(passwordHolderCookie, holder, ctx.context.secret, {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
                maxAge: confirmationLifetime,
              })
            }
            if (ctx.path === "/verify-email" && ctx.request) {
              return removedPasswords.has(ctx.request)
                ? ctx.json({ ...returned, passwordRemoved: true })
                : undefined
            }
            // A successful reset signs the user in with a new session (every other one is revoked).
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
