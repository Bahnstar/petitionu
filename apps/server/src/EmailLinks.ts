import { createHash } from "node:crypto"
import type { AuthContext, BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api"
import { verifyJWT } from "better-auth/crypto"
import * as z from "zod"

/** A link that can't be used, whatever the reason, so the answer says nothing about which. */
const invalidLink = () =>
  new APIError("BAD_REQUEST", {
    code: "INVALID_LINK",
    message: "This link is invalid or has expired",
  })

/** The address a Confirm link's token names, read the way `/verify-email` reads it. */
const confirmAddress = async (context: AuthContext, token: string) => {
  const payload = await verifyJWT(token, context.secret)
  const email = z.object({ email: z.email() }).safeParse(payload).data?.email
  const found = email ? await context.internalAdapter.findUserByEmail(email) : null
  if (!found) throw invalidLink()
  return { email: found.user.email, signsIn: !found.user.emailVerified }
}

/**
 * The address a magic link's token names. Finding the row doesn't use it: only
 * `/magic-link/verify` consumes one. `storeToken: "hashed"` keeps the digest computed here.
 */
const magicAddress = async (context: AuthContext, token: string) => {
  const digest = createHash("sha256").update(token).digest("base64url")
  const row = await context.internalAdapter.findVerificationValue(`magic-link:${digest}`)
  if (!row || row.expiresAt <= new Date()) throw invalidLink()
  const { email } = JSON.parse(row.value) as { readonly email: string }
  return { email: email.toLowerCase(), signsIn: true }
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
    const { email, signsIn } = await (purpose === "confirm"
      ? confirmAddress(ctx.context, token)
      : magicAddress(ctx.context, token))
    const session = signsIn ? await getSessionFromCtx(ctx) : null
    const signedInAs = session?.user.email.toLowerCase() === email ? null : session?.user.email
    return ctx.json({ email, signedInAs: signedInAs ?? null })
  },
)

/** The endpoints the emailed-link pages call that Better Auth doesn't have. */
export const emailLinks = () =>
  ({ id: "email-links", endpoints: { linkDetails } }) satisfies BetterAuthPlugin
