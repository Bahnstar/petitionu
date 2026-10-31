import { assert, describe, it } from "@effect/vitest"
import type { UpdateMyProfileInput } from "@petitionu/domain"
import { Effect } from "effect"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { insertOrganization, me, pendingOrganizationOf } from "./support/campus.ts"
import type { TestApp } from "./support/harness.ts"
import { makeJobsApp } from "./support/jobs.ts"
import { createUser, uniqueEmail } from "./support/users.ts"

const profile = { firstName: "Ada", lastName: "Lovelace", graduationYear: 2028 }

const save = (browser: Browser, input: UpdateMyProfileInput) =>
  browser.rpc((api) => api.updateMyProfile(input))

/**
 * A fresh non-school domain: confirming there creates no organization, so each test decides
 * which campuses exist.
 */
const campusDomain = () => `campus-${crypto.randomUUID().slice(0, 8)}.org`

const confirmedAt = (app: TestApp, domain: string) =>
  createUser(app, { stage: "confirmed", email: uniqueEmail(domain) })

const storedProfile = (app: TestApp, userId: string) =>
  app.sql<{
    firstName: string | null
    lastName: string | null
    graduationYear: number | null
    organizationId: string | null
    role: string
    email: string
    confirmed: boolean
  }>`
    SELECT first_name AS "firstName", last_name AS "lastName",
      graduation_year::int AS "graduationYear", organization_id AS "organizationId", role,
      email::text AS email, confirmed_at IS NOT NULL AS confirmed
    FROM users WHERE id = ${userId}
  `.pipe(
    Effect.map((rows) => rows[0]!),
    Effect.orDie,
  )

describe("updateMyProfile", () => {
  it.live("saves the caller's profile and assigns the campus for their email's exact domain", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      const user = yield* confirmedAt(app, domain)
      const campus = yield* insertOrganization(app, {
        domain: `  ${domain.toUpperCase()}  `,
        name: "Campus",
      })

      const result = yield* save(user.browser, profile)
      if (!result.success) return assert.fail(JSON.stringify(result))
      assert.deepInclude(result.data, {
        id: user.id,
        firstName: "Ada",
        lastName: "Lovelace",
        graduationYear: 2028,
        emailVerified: true,
        profileComplete: true,
        organizationId: campus,
        organization: { id: campus, name: "Campus" },
      })
      assert.deepInclude(yield* me(user.browser), { profileComplete: true, organizationId: campus })
    }),
  )

  it.live("updates only the caller, even for an admin, and returns the profile fields", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      const campus = yield* insertOrganization(app, { domain, name: "RPC Campus" })
      const other = yield* createUser(app, { stage: "confirmed", email: uniqueEmail(domain) })
      const admin = yield* createUser(app, {
        stage: "confirmed",
        role: "admin",
        email: uniqueEmail(domain),
      })

      const result = yield* save(admin.browser, { firstName: "RPC", lastName: "Person" })
      if (!result.success) return assert.fail(JSON.stringify(result))
      assert.deepInclude(result.data, {
        id: admin.id,
        emailVerified: true,
        profileComplete: true,
        organizationId: campus,
        organization: { id: campus, name: "RPC Campus" },
      })
      assert.isNull((yield* storedProfile(app, other.id)).firstName)
    }),
  )

  it.live("tells an unconfirmed user to confirm their email first", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      yield* insertOrganization(app, { domain })
      const user = yield* createUser(app, { stage: "unconfirmed", email: uniqueEmail(domain) })
      assert.deepStrictEqual(yield* save(user.browser, profile), {
        success: false,
        errors: [
          {
            type: "invalid",
            field: "email",
            message: "Confirm your email before completing your profile.",
          },
        ],
      })
      assert.isNull((yield* storedProfile(app, user.id)).firstName)
    }),
  )

  it.live("sends a user without one supported campus to support", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      yield* insertOrganization(app, { domain: `other${domain}` })
      yield* insertOrganization(app, { domain: `sub.${domain}` })
      const user = yield* confirmedAt(app, domain)
      const noCampus = {
        success: false,
        errors: [
          {
            type: "invalid",
            field: "email",
            message:
              "We could not match your email to one supported campus. Contact support for help.",
          },
        ],
      } as const
      assert.deepStrictEqual(yield* save(user.browser, profile), noCampus)

      // Two organizations claiming the domain are ambiguous too.
      yield* insertOrganization(app, { domain })
      yield* insertOrganization(app, { domain: ` ${domain} ` })
      assert.deepStrictEqual(yield* save(user.browser, profile), noCampus)
      assert.isNull((yield* storedProfile(app, user.id)).organizationId)
    }),
  )

  it.live("can't activate a school that is still pending verification", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const user = yield* createUser(app, {
        stage: "confirmed",
        email: uniqueEmail(`school-${crypto.randomUUID().slice(0, 8)}.edu`),
      })
      assert.isNotNull(yield* pendingOrganizationOf(app, user.id))
      assert.deepInclude(yield* save(user.browser, profile), { success: false })
      assert.isNull((yield* storedProfile(app, user.id)).organizationId)
    }),
  )

  it.live("keeps the verified school a student subdomain was assigned to", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = `school-${crypto.randomUUID().slice(0, 8)}.edu`
      const school = yield* insertOrganization(app, { domain })
      const user = yield* createUser(app, {
        stage: "confirmed",
        email: uniqueEmail(`students.${domain}`),
      })
      assert.strictEqual((yield* me(user.browser)).organizationId, school)
      const result = yield* save(user.browser, profile)
      assert.deepInclude(result, { success: true })
      assert.strictEqual((yield* storedProfile(app, user.id)).organizationId, school)
    }),
  )

  it.live("requires names and checks the graduation year, field by field", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      yield* insertOrganization(app, { domain })
      const user = yield* confirmedAt(app, domain)

      assert.deepStrictEqual(
        yield* save(user.browser, { firstName: "  ", lastName: "", graduationYear: 12 }),
        {
          success: false,
          errors: [
            { type: "invalid", field: "firstName", message: "must be present" },
            { type: "invalid", field: "lastName", message: "must be present" },
            {
              type: "invalid",
              field: "graduationYear",
              message:
                "must be greater than or equal to 1900 and must be less than or equal to 2100",
            },
          ],
        },
      )
      assert.deepStrictEqual(
        yield* save(user.browser, { firstName: "A".repeat(101), lastName: "Lovelace" }),
        {
          success: false,
          errors: [
            {
              type: "invalid",
              field: "firstName",
              message: "must have length of between 1 and 100",
            },
          ],
        },
      )
      assert.deepInclude(yield* save(user.browser, { ...profile, graduationYear: 2101 }), {
        success: false,
      })
      assert.deepInclude(yield* save(user.browser, { ...profile, graduationYear: 1900 }), {
        success: true,
      })
    }),
  )

  it.live("trims names and leaves the graduation year optional", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      yield* insertOrganization(app, { domain })
      const user = yield* confirmedAt(app, domain)
      const result = yield* save(user.browser, { firstName: "  Ada  ", lastName: "  Lovelace  " })
      if (!result.success) return assert.fail(JSON.stringify(result))
      assert.deepInclude(result.data, {
        firstName: "Ada",
        lastName: "Lovelace",
        graduationYear: null,
        profileComplete: true,
      })
    }),
  )

  it.live("rejects guests", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const guest = yield* makeBrowser(app)
      assert.deepInclude(yield* save(guest, profile), { success: false })
    }),
  )

  it.live("ignores forged identity and authority fields", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      const campus = yield* insertOrganization(app, { domain })
      const elsewhere = yield* insertOrganization(app, { domain: campusDomain() })
      const user = yield* confirmedAt(app, domain)
      const csrf = yield* user.browser.reloadCsrf

      // Sent as raw RPC requests, past the typed client, which would drop the extra fields.
      for (const forged of [
        { role: "superadmin" },
        { email: "other@example.org" },
        { organizationId: elsewhere },
        { confirmedAt: new Date().toISOString() },
      ]) {
        const response = yield* user.browser.request("/rpc", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({
            _tag: "Request",
            id: "1",
            tag: "updateMyProfile",
            payload: { ...profile, ...forged },
            headers: [],
          }),
        })
        assert.strictEqual(response.status, 200)
      }
      const stored = yield* storedProfile(app, user.id)
      assert.deepStrictEqual(stored, {
        firstName: "Ada",
        lastName: "Lovelace",
        graduationYear: 2028,
        organizationId: campus,
        role: "student",
        email: user.email,
        confirmed: true,
      })
    }),
  )
})

describe("getOrganizations", () => {
  it.live("lists organizations to anyone", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = campusDomain()
      const campus = yield* insertOrganization(app, {
        domain,
        name: "Listed Campus",
        allowPublicSignatures: true,
      })
      const guest = yield* makeBrowser(app)
      const result = yield* guest.rpc((api) => api.getOrganizations())
      if (!result.success) return assert.fail(JSON.stringify(result))
      assert.deepStrictEqual(
        result.data.find((organization) => organization.id === campus),
        {
          id: campus,
          name: "Listed Campus",
          description: null,
          domain,
          logoUrl: null,
          allowPublicSignatures: true,
          verificationStatus: "approved",
        },
      )
    }),
  )
})
