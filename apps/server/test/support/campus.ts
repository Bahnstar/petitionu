import { Effect } from "effect"
import type { Browser } from "./browser.ts"
import type { TestApp } from "./harness.ts"

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
