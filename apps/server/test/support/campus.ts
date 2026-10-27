import { Effect } from "effect"
import { type Browser, makeBrowser } from "./browser.ts"
import type { TestApp } from "./harness.ts"
import { withEmailTo } from "./users.ts"

let nextSchool = 1

/** A fresh `.edu` school domain. */
export const schoolDomain = () => `school${nextSchool++}-${crypto.randomUUID().slice(0, 8)}.edu`

/** `getMe` for a signed-in browser; dies if it fails. */
export const me = (browser: Browser) =>
  Effect.flatMap(
    browser.rpc((api) => api.getMe()),
    (result) =>
      result.success ? Effect.succeed(result.data) : Effect.die(new Error(JSON.stringify(result))),
  )

/** The organizations stored for `domain` (case-insensitive, as the column is citext). */
export const organizationsAt = (app: TestApp, domain: string) =>
  app.sql<{
    id: string
    name: string | null
    verificationStatus: string
    allowPublicSignatures: boolean
  }>`
    SELECT id, name, verification_status AS "verificationStatus",
      allow_public_signatures AS "allowPublicSignatures"
    FROM organization WHERE domain = ${domain}
  `.pipe(Effect.orDie)

/** The organization a user waits to join; the API doesn't show it. */
export const pendingOrganizationOf = (app: TestApp, userId: string) =>
  app.sql<{ pendingOrganizationId: string | null }>`
    SELECT pending_organization_id AS "pendingOrganizationId" FROM users WHERE id = ${userId}
  `.pipe(
    Effect.map((rows) => rows[0]?.pendingOrganizationId ?? null),
    Effect.orDie,
  )

/** Signs in (or up) through an emailed magic link, in a new browser. */
export const magicSignIn = (app: TestApp, email: string) =>
  Effect.gen(function* () {
    const { token } = yield* withEmailTo(
      app,
      email,
      Effect.flatMap(makeBrowser(app), (browser) => browser.auth("/sign-in/magic-link", { email })),
    )
    const browser = yield* makeBrowser(app)
    const response = yield* browser.authGet(`/magic-link/verify?token=${encodeURIComponent(token)}`)
    if (response.status !== 200 && response.status !== 302) {
      return yield* Effect.die(new Error(`magic link failed: ${JSON.stringify(response)}`))
    }
    yield* browser.reloadCsrf
    return { browser, me: yield* me(browser) }
  })

/** Resets a password through the emailed link, in a new browser. */
export const resetPassword = (app: TestApp, email: string, newPassword = "new-password123") =>
  Effect.gen(function* () {
    const { token } = yield* withEmailTo(
      app,
      email,
      Effect.flatMap(makeBrowser(app), (browser) =>
        browser.auth("/request-password-reset", { email }),
      ),
    )
    const browser = yield* makeBrowser(app)
    const response = yield* browser.auth("/reset-password", { token, newPassword })
    if (response.status !== 200) {
      return yield* Effect.die(new Error(`reset failed: ${JSON.stringify(response)}`))
    }
    yield* browser.reloadCsrf
    return browser
  })

/** Inserts an organization as an operator would, approved by default. */
export const insertOrganization = (
  app: TestApp,
  options: {
    readonly domain: string | null
    readonly name?: string
    readonly status?: "pending" | "verified" | "approved"
    readonly allowPublicSignatures?: boolean
  },
) =>
  app.sql<{ id: string }>`
    INSERT INTO organization (name, domain, verification_status, allow_public_signatures)
    VALUES (${options.name ?? "Campus"}, ${options.domain}, ${options.status ?? "approved"},
      ${options.allowPublicSignatures ?? false})
    RETURNING id
  `.pipe(
    Effect.map((rows) => rows[0]!.id),
    Effect.orDie,
  )
