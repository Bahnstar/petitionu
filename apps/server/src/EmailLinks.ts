import { createHash } from "node:crypto"
import type { AuthContext, BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { verifyJWT } from "better-auth/crypto"
import { revokeUnprovenAccountAccess } from "better-auth/db"
import * as z from "zod"

/** A link that can't be used, whatever the reason, so the answer says nothing about which. */
const invalidLink = () =>
  new APIError("BAD_REQUEST", {
    code: "INVALID_LINK",
    message: "This link is invalid or has expired",
  })

/** The user a Confirm link's token names, read the way `/verify-email` reads it. */
const confirmingUser = async (context: AuthContext, token: string) => {
  const payload = await verifyJWT(token, context.secret)
  const email = z.object({ email: z.email() }).safeParse(payload).data?.email
  const found = email ? await context.internalAdapter.findUserByEmail(email) : null
  if (!found) throw invalidLink()
  return found.user
}

const confirmDetails = async (context: AuthContext, token: string) => {
  const user = await confirmingUser(context, token)
  const signsIn = !user.emailVerified
  const account = signsIn ? await context.internalAdapter.findCredentialAccount(user.id) : null
  return { email: user.email, signsIn, needsPassword: Boolean(account) }
}

/**
 * The address a magic link's token names. Finding the row doesn't use it: only
 * `/magic-link/verify` consumes one. `storeToken: "hashed"` keeps the digest computed here.
 */
const magicDetails = async (context: AuthContext, token: string) => {
  const digest = createHash("sha256").update(token).digest("base64url")
  const row = await context.internalAdapter.findVerificationValue(`magic-link:${digest}`)
  if (!row || row.expiresAt <= new Date()) throw invalidLink()
  const { email } = JSON.parse(row.value) as { readonly email: string }
  return { email: email.toLowerCase(), signsIn: true, needsPassword: false }
}

/**
 * `POST /link-details`: what an emailed link is for, so its page can say so before the click. It
 * uses no token, so a mail scanner opening the page spends nothing, and POST with the token in
 * the body keeps the answer out of caches and the token out of access logs.
 */
const linkDetails = createAuthEndpoint(
  "/link-details",
  {
    method: "POST",
    body: z.object({ purpose: z.enum(["confirm", "magic"]), token: z.string() }),
  },
  async (ctx) => {
    const { purpose, token } = ctx.body
    const { email, signsIn, needsPassword } = await (purpose === "confirm"
      ? confirmDetails(ctx.context, token)
      : magicDetails(ctx.context, token))
    const session = signsIn ? await getSessionFromCtx(ctx) : null
    const signedInAs = session?.user.email.toLowerCase() === email ? null : session?.user.email
    return ctx.json({ email, needsPassword, signedInAs: signedInAs ?? null })
  },
)

/**
 * Confirms a user without touching their password, by `revokeUnprovenAccountAccess` shown an
 * account with nothing linked. That keeps its lock, so a concurrent click can't end the session
 * this one starts, and its order: sessions end before `email_verified` flips.
 */
const confirmKeepingPassword = (context: AuthContext, userId: string) =>
  revokeUnprovenAccountAccess(
    {
      context: {
        ...context,
        internalAdapter: { ...context.internalAdapter, findAccounts: async () => [] },
      },
    } as Parameters<typeof revokeUnprovenAccountAccess>[0],
    userId,
  )

/**
 * A click that loses Better Auth's lock stops waiting after 2 s, or throws if the lock goes in the
 * moment it looks, with the winner maybe not finished. Its password was still right, so one more
 * go, and then what counts is whether the user ended up confirmed.
 */
const settleConfirmation = async (context: AuthContext, userId: string) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = await confirmKeepingPassword(context, userId).catch((error: unknown) => {
      context.logger.warn("Confirming a user lost the lock", error)
      return null
    })
    if (user?.emailVerified) return user
  }
  return context.internalAdapter.findUserById(userId)
}

/**
 * `POST /verify-email/password`: confirms a user who proves the account's password, which keeps
 * it. `/verify-email` is a GET and can't carry one. Sign-up proves nothing about an address, so
 * the password is the only evidence that whoever is confirming chose it; a wrong one changes
 * nothing and leaves the token usable. A confirmed account gets the answer `/verify-email` gives
 * it, whatever was sent, so an old link can't be used to test passwords.
 */
const verifyEmailWithPassword = createAuthEndpoint(
  "/verify-email/password",
  {
    method: "POST",
    body: z.object({ token: z.string(), password: z.string() }),
  },
  async (ctx) => {
    const { context } = ctx
    const user = await confirmingUser(context, ctx.body.token)
    if (user.emailVerified) return ctx.json({ status: true, user: null })

    const account = await context.internalAdapter.findCredentialAccount(user.id)
    const proved =
      account?.password &&
      (await context.password.verify({ hash: account.password, password: ctx.body.password }))
    if (!proved) {
      throw new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Incorrect password" })
    }

    const confirmed = await settleConfirmation(context, user.id)
    if (!confirmed?.emailVerified) throw new APIError("INTERNAL_SERVER_ERROR")
    const session = await context.internalAdapter.createSession(user.id)
    await setSessionCookie(ctx, { session, user: confirmed })
    return ctx.json({ status: true, user: null })
  },
)

/** The endpoints the emailed-link pages call that Better Auth doesn't have. */
export const emailLinks = () =>
  ({
    id: "email-links",
    endpoints: { linkDetails, verifyEmailWithPassword },
  }) satisfies BetterAuthPlugin
