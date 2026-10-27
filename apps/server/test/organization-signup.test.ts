import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { UserConfirmedLive } from "../src/App.ts"
import { UserConfirmed } from "../src/Confirmation.ts"
import { makeBrowser } from "./support/browser.ts"
import {
  insertOrganization,
  magicSignIn,
  me,
  organizationsAt,
  pendingOrganizationOf,
  resetPassword,
  schoolDomain,
} from "./support/campus.ts"
import { makeJobsApp } from "./support/jobs.ts"
import {
  confirmEmail,
  createUser,
  lastEmailedToken,
  registerUser,
  uniqueEmail,
} from "./support/users.ts"

describe("campus assignment on confirmation", () => {
  it.live(
    "password registration waits for confirmation, then joins a new school once it's verified",
    () =>
      Effect.gen(function* () {
        const { app, jobs } = yield* makeJobsApp()
        const domain = schoolDomain()
        const user = yield* registerUser(app, { email: `alex@${domain}` })
        assert.isNull((yield* me(user.browser)).organizationId)
        assert.deepStrictEqual(yield* organizationsAt(app, domain), [])
        assert.deepStrictEqual(yield* jobs.jobsFor(user.id), [])

        yield* confirmEmail(app, user.browser, user.email)
        const [organization] = yield* organizationsAt(app, domain)
        assert.deepInclude(organization, { name: domain, verificationStatus: "pending" })
        const confirmed = yield* me(user.browser)
        assert.isTrue(confirmed.emailVerified)
        assert.isNull(confirmed.organizationId)
        assert.strictEqual(confirmed.role, "student")
        assert.strictEqual(yield* pendingOrganizationOf(app, user.id), organization!.id)
        assert.deepStrictEqual(yield* jobs.jobsFor(user.id), [
          { state: "pending", attempts: 0, dueIn: 0 },
        ])

        assert.deepStrictEqual(yield* jobs.drain, ["activated"])
        const activated = yield* me(user.browser)
        assert.strictEqual(activated.organizationId, organization!.id)
        assert.strictEqual(activated.organization?.name, "Registry University")
        assert.isNull(yield* pendingOrganizationOf(app, user.id))
      }),
  )

  it.live("joins an existing school without replacing its name or settings", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const domain = schoolDomain()
      const organization = yield* insertOrganization(app, {
        domain,
        name: "Named University",
        allowPublicSignatures: true,
      })
      const first = yield* createUser(app, { stage: "confirmed", email: `alex@${domain}` })
      const second = yield* createUser(app, {
        stage: "confirmed",
        email: `sam@students.${domain}`,
      })

      assert.strictEqual((yield* me(first.browser)).organizationId, organization)
      assert.strictEqual((yield* me(second.browser)).organizationId, organization)
      assert.deepStrictEqual(yield* organizationsAt(app, domain), [
        {
          id: organization,
          name: "Named University",
          verificationStatus: "approved",
          allowPublicSignatures: true,
        },
      ])
      assert.deepStrictEqual(yield* jobs.drain, [])
    }),
  )

  it.live("an .ac.uk subdomain joins its school rather than an ac.uk organization", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const domain = `school${crypto.randomUUID().slice(0, 8)}.ac.uk`
      const user = yield* createUser(app, { stage: "confirmed", email: `alex@students.${domain}` })
      const [organization] = yield* organizationsAt(app, domain)
      assert.strictEqual(yield* pendingOrganizationOf(app, user.id), organization!.id)

      assert.deepStrictEqual(yield* jobs.drain, ["activated"])
      assert.deepStrictEqual(yield* app.registry.lookups, [domain])
      assert.strictEqual((yield* me(user.browser)).organizationId, organization!.id)
      assert.deepStrictEqual(yield* organizationsAt(app, "ac.uk"), [])
    }),
  )

  it.live("an organization for the exact subdomain takes precedence over its parent school", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = schoolDomain()
      yield* insertOrganization(app, { domain })
      const campus = yield* insertOrganization(app, { domain: `campus.${domain}` })
      const user = yield* createUser(app, { stage: "confirmed", email: `alex@campus.${domain}` })
      assert.strictEqual((yield* me(user.browser)).organizationId, campus)
    }),
  )

  it.live("known non-academic domains can join, but unknown ones stay unassigned", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const domain = `school${crypto.randomUUID().slice(0, 8)}.org`
      const organization = yield* insertOrganization(app, { domain })
      const member = yield* createUser(app, { stage: "confirmed", email: `alex@${domain}` })
      assert.strictEqual((yield* me(member.browser)).organizationId, organization)

      for (const host of ["unknown.example", "gmail.com", "school.edu.attacker.com"]) {
        const user = yield* createUser(app, { stage: "confirmed", email: uniqueEmail(host) })
        const account = yield* me(user.browser)
        assert.isNull(account.organizationId)
        assert.isTrue(account.emailVerified)
        assert.isNull(yield* pendingOrganizationOf(app, user.id))
      }
      assert.deepStrictEqual(yield* organizationsAt(app, "school.edu.attacker.com"), [])
      assert.deepStrictEqual(yield* organizationsAt(app, "attacker.com"), [])
      assert.deepStrictEqual(yield* jobs.drain, [])
    }),
  )

  it.live("magic-link sign-up waits for the school, and later sign-ins keep the membership", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const domain = schoolDomain()
      const email = `alex@${domain}`
      const { me: signedUp } = yield* magicSignIn(app, email)
      const [organization] = yield* organizationsAt(app, domain)
      assert.isTrue(signedUp.emailVerified)
      assert.strictEqual(signedUp.role, "student")
      assert.isNull(signedUp.organizationId)
      assert.strictEqual(yield* pendingOrganizationOf(app, signedUp.id), organization!.id)
      assert.deepStrictEqual(yield* jobs.drain, ["activated"])

      const other = yield* insertOrganization(app, { domain: schoolDomain() })
      yield* app.sql`UPDATE users SET organization_id = ${other} WHERE id = ${signedUp.id}`
      const { me: returning } = yield* magicSignIn(app, email)
      assert.strictEqual(returning.id, signedUp.id)
      assert.strictEqual(returning.organizationId, other)
    }),
  )

  it.live("a password reset confirms an unconfirmed account and assigns it", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const domain = schoolDomain()
      const user = yield* registerUser(app, { email: `alex@${domain}` })
      const browser = yield* resetPassword(app, user.email)
      const account = yield* me(browser)
      assert.strictEqual(account.id, user.id)
      assert.isTrue(account.emailVerified)
      assert.isNull(account.organizationId)
      const [organization] = yield* organizationsAt(app, domain)
      assert.strictEqual(yield* pendingOrganizationOf(app, user.id), organization!.id)
      assert.deepStrictEqual(yield* jobs.drain, ["activated"])
    }),
  )

  it.live("repeated sign-ins while verification is pending share one queued job", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const email = `alex@${schoolDomain()}`
      const { me: first } = yield* magicSignIn(app, email)
      const { me: second } = yield* magicSignIn(app, email)
      assert.strictEqual(second.id, first.id)
      assert.isNull(second.organizationId)
      assert.lengthOf(yield* jobs.jobsFor(first.id), 1)
      assert.deepStrictEqual(yield* app.registry.lookups, [])
    }),
  )

  it.live("invalid confirmation and magic-link tokens never create organizations", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const domain = schoolDomain()
      const user = yield* registerUser(app, { email: `alex@${domain}` })
      const confirm = yield* user.browser.authGet("/verify-email?token=invalid")
      assert.notStrictEqual(confirm.status, 200)
      const stranger = yield* makeBrowser(app)
      yield* stranger.authGet("/magic-link/verify?token=invalid")
      yield* stranger.reloadCsrf
      assert.deepInclude(yield* stranger.rpc((api) => api.getMe()), { success: false })
      assert.isFalse((yield* me(user.browser)).emailVerified)
      assert.deepStrictEqual(yield* organizationsAt(app, domain), [])
    }),
  )

  it.live(
    "a failed assignment rolls back the school, membership and job, and is retried on the next request",
    () =>
      Effect.gen(function* () {
        let failures = 1
        const flaky = Layer.effect(
          UserConfirmed,
          Effect.gen(function* () {
            const assign = yield* UserConfirmed
            return (userId: string) =>
              Effect.flatMap(assign(userId), () =>
                failures-- > 0 ? Effect.fail("simulated failure after assignment") : Effect.void,
              )
          }),
        ).pipe(Layer.provide(UserConfirmedLive))
        const { app, jobs } = yield* makeJobsApp({ userConfirmed: flaky })
        const domain = schoolDomain()
        const user = yield* registerUser(app, { email: `alex@${domain}` })
        const token = yield* lastEmailedToken(app, user.email)
        yield* user.browser.authGet(`/verify-email?token=${encodeURIComponent(token)}`)

        const stored = yield* app.sql<{ confirmed: boolean; pending: string | null }>`
          SELECT confirmed_at IS NOT NULL AS confirmed, pending_organization_id AS pending
          FROM users WHERE id = ${user.id}
        `
        assert.deepStrictEqual(stored, [{ confirmed: false, pending: null }])
        assert.deepStrictEqual(yield* organizationsAt(app, domain), [])
        assert.deepStrictEqual(yield* jobs.jobsFor(user.id), [])

        yield* user.browser.reloadCsrf
        const retried = yield* me(user.browser)
        assert.isTrue(retried.emailVerified)
        assert.isNull(retried.organizationId)
        const [organization] = yield* organizationsAt(app, domain)
        assert.strictEqual(yield* pendingOrganizationOf(app, user.id), organization!.id)
        assert.lengthOf(yield* jobs.jobsFor(user.id), 1)
      }),
  )
})
