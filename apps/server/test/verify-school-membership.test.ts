import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  insertOrganization,
  me,
  organizationsAt,
  pendingOrganizationOf,
  schoolDomain,
} from "./support/campus.ts"
import type { TestApp } from "./support/harness.ts"
import { makeJobsApp } from "./support/jobs.ts"
import { createUser } from "./support/users.ts"

/** A confirmed student waiting for a new (pending) school at `domain`. */
const pendingUser = (app: TestApp, domain = schoolDomain()) =>
  Effect.gen(function* () {
    const user = yield* createUser(app, {
      stage: "confirmed",
      email: `student-${crypto.randomUUID().slice(0, 8)}@${domain}`,
    })
    const organization = yield* pendingOrganizationOf(app, user.id)
    assert.isNotNull(organization)
    return { user, domain, organization: organization! }
  })

const registryEvidence = (app: TestApp, organizationId: string) =>
  app.sql<{
    name: string | null
    verificationStatus: string
    registryName: string | null
    registrySource: string | null
    registryError: string | null
    checked: boolean
  }>`
    SELECT name, verification_status AS "verificationStatus", registry_name AS "registryName",
      registry_source AS "registrySource", registry_error AS "registryError",
      registry_checked_at IS NOT NULL AS checked
    FROM organization WHERE id = ${organizationId}
  `.pipe(
    Effect.map((rows) => rows[0]!),
    Effect.orDie,
  )

describe("VerifySchoolMembership", () => {
  it.live(
    "verifies the school, saves the registry evidence and activates every waiting user with one lookup",
    () =>
      Effect.gen(function* () {
        const { app, jobs } = yield* makeJobsApp()
        const first = yield* pendingUser(app)
        const second = yield* pendingUser(app, first.domain)
        assert.strictEqual(second.organization, first.organization)

        assert.deepStrictEqual(yield* jobs.drain, ["activated", "activated"])
        assert.deepStrictEqual(yield* app.registry.lookups, [first.domain])
        assert.deepStrictEqual(yield* registryEvidence(app, first.organization), {
          name: "Registry University",
          verificationStatus: "verified",
          registryName: "Registry University",
          registrySource: "test-registry",
          registryError: null,
          checked: true,
        })
        for (const { user } of [first, second]) {
          const account = yield* me(user.browser)
          assert.strictEqual(account.organizationId, first.organization)
          assert.strictEqual(account.role, "student")
          assert.isNull(yield* pendingOrganizationOf(app, user.id))
          assert.deepInclude((yield* jobs.jobsFor(user.id))[0], { state: "completed" })
        }
      }),
  )

  it.live(
    "a failed lookup is recorded and retried later; jobs for the same school defer meanwhile",
    () =>
      Effect.gen(function* () {
        const { app, jobs } = yield* makeJobsApp()
        const first = yield* pendingUser(app)
        const second = yield* pendingUser(app, first.domain)
        yield* app.registry.script("unavailable")

        assert.deepStrictEqual(yield* jobs.drain, ["failed:unavailable", "deferred"])
        assert.deepStrictEqual(yield* app.registry.lookups, [first.domain])
        assert.deepInclude(yield* registryEvidence(app, first.organization), {
          verificationStatus: "pending",
          registryError: "unavailable",
          checked: true,
        })
        assert.isNull((yield* me(first.user.browser)).organizationId)
        // The failure used an attempt and backs off; the deferral used none.
        assert.deepStrictEqual(yield* jobs.jobsFor(first.user.id), [
          { state: "pending", attempts: 1, dueIn: 60 },
        ])
        assert.deepStrictEqual(yield* jobs.jobsFor(second.user.id), [
          { state: "pending", attempts: 0, dueIn: 60 },
        ])

        yield* app.registry.script(() => ({ name: "Registry University", source: "test-registry" }))
        yield* jobs.elapse("60 seconds")
        assert.deepStrictEqual(yield* jobs.drain, ["activated", "activated"])
        assert.lengthOf(yield* app.registry.lookups, 2)
        assert.deepInclude(yield* registryEvidence(app, first.organization), {
          verificationStatus: "verified",
          registryError: null,
        })
        assert.strictEqual((yield* me(second.user.browser)).organizationId, first.organization)
      }),
  )

  it.live("backs off 60 s × 2^(attempt − 1), capped at a day, and gives up after 20 attempts", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user } = yield* pendingUser(app)
      yield* app.registry.script("inconclusive")

      const delays: Array<number> = []
      for (let attempt = 1; attempt <= 20; attempt++) {
        assert.deepStrictEqual(yield* jobs.drain, ["failed:inconclusive"])
        const [job] = yield* jobs.jobsFor(user.id)
        assert.strictEqual(job!.attempts, attempt)
        if (attempt === 20) {
          assert.strictEqual(job!.state, "failed")
          break
        }
        assert.strictEqual(job!.state, "pending")
        delays.push(job!.dueIn)
        yield* jobs.elapse(`${job!.dueIn} seconds`)
      }
      assert.deepStrictEqual(
        delays,
        [
          60, 120, 240, 480, 960, 1920, 3840, 7680, 15360, 30720, 61440, 86400, 86400, 86400, 86400,
          86400, 86400, 86400, 86400,
        ],
      )
      assert.deepStrictEqual(yield* jobs.drain, [])
      assert.isNull((yield* me(user.browser)).organizationId)
    }),
  )

  it.live("a queued job survives the process that queued it", () =>
    Effect.gen(function* () {
      const { app: before } = yield* makeJobsApp()
      const { user, organization } = yield* pendingUser(before)
      const { jobs } = yield* makeJobsApp({ database: before.database })
      assert.deepStrictEqual(yield* jobs.drain, ["activated"])
      assert.strictEqual((yield* me(user.browser)).organizationId, organization)
    }),
  )

  it.live("runs in the background in a server with workers on", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp({ env: { JOB_WORKERS: "true" } })
      const domain = schoolDomain()
      const user = yield* createUser(app, { stage: "confirmed", email: `alex@${domain}` })
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((yield* me(user.browser)).organizationId !== null) break
        yield* Effect.sleep("50 millis")
      }
      const [organization] = yield* organizationsAt(app, domain)
      assert.strictEqual((yield* me(user.browser)).organizationId, organization!.id)
      assert.deepInclude((yield* jobs.jobsFor(user.id))[0], { state: "completed" })
    }),
  )

  it.live("leaves an existing membership alone and doesn't enroll an unconfirmed user", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const assigned = yield* pendingUser(app)
      const other = yield* insertOrganization(app, { domain: null, name: "Other school" })
      yield* app.sql`UPDATE users SET organization_id = ${other} WHERE id = ${assigned.user.id}`
      const unconfirmed = yield* pendingUser(app, assigned.domain)
      yield* app.sql`UPDATE users SET confirmed_at = NULL WHERE id = ${unconfirmed.user.id}`

      assert.deepStrictEqual(yield* jobs.drain, ["skipped", "skipped"])
      assert.deepStrictEqual(yield* app.registry.lookups, [])
      assert.strictEqual((yield* me(assigned.user.browser)).organizationId, other)
      const [stored] = yield* app.sql<{ organizationId: string | null }>`
        SELECT organization_id AS "organizationId" FROM users WHERE id = ${unconfirmed.user.id}
      `
      assert.isNull(stored!.organizationId)
    }),
  )

  it.live("cancels without retrying when the school's domain no longer matches", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user, organization } = yield* pendingUser(app)
      yield* app.sql`UPDATE organization SET domain = ${schoolDomain()} WHERE id = ${organization}`

      assert.deepStrictEqual(yield* jobs.drain, ["cancelled"])
      assert.deepStrictEqual(yield* app.registry.lookups, [])
      assert.isNull((yield* me(user.browser)).organizationId)
      assert.deepInclude((yield* jobs.jobsFor(user.id))[0], { state: "completed", attempts: 1 })
    }),
  )

  it.live("a deleted user needs no registry lookup", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user } = yield* pendingUser(app)
      yield* app.sql`DELETE FROM users WHERE id = ${user.id}`
      assert.deepStrictEqual(yield* jobs.drain, ["skipped"])
      assert.deepStrictEqual(yield* app.registry.lookups, [])
    }),
  )

  it.live("a lookup result for a domain that changed meanwhile verifies nothing", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user, organization } = yield* pendingUser(app)
      yield* app.registry.script(() =>
        app.sql`UPDATE organization SET domain = ${schoolDomain()} WHERE id = ${organization}`.pipe(
          Effect.orDie,
          Effect.as({ name: "Old school", source: "test-registry" }),
        ),
      )

      assert.deepStrictEqual(yield* jobs.drain, ["failed:StaleRecord"])
      assert.deepInclude(yield* registryEvidence(app, organization), {
        verificationStatus: "pending",
        registryName: null,
      })
      assert.isNull((yield* me(user.browser)).organizationId)
    }),
  )

  it.live("a membership changed during the lookup isn't overwritten", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user } = yield* pendingUser(app)
      const other = yield* insertOrganization(app, { domain: null, name: "Other school" })
      yield* app.registry.script(() =>
        app.sql`UPDATE users SET organization_id = ${other} WHERE id = ${user.id}`.pipe(
          Effect.orDie,
          Effect.as({ name: "Registry University", source: "test-registry" }),
        ),
      )

      assert.deepStrictEqual(yield* jobs.drain, ["failed:StaleRecord"])
      assert.strictEqual((yield* me(user.browser)).organizationId, other)
    }),
  )

  it.live("keeps a school name chosen before verification", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { organization, domain } = yield* pendingUser(app)
      yield* app.sql`UPDATE organization SET name = 'Chosen School Name' WHERE id = ${organization}`

      assert.deepStrictEqual(yield* jobs.drain, ["activated"])
      assert.deepInclude(yield* registryEvidence(app, organization), {
        name: "Chosen School Name",
        registryName: "Registry University",
      })
      assert.lengthOf(yield* organizationsAt(app, domain), 1)
    }),
  )

  it.live("doesn't activate a user at an organization in no known status", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user, organization } = yield* pendingUser(app)
      // The column is free text, so nothing keeps other values out.
      yield* app.sql`
        UPDATE organization SET verification_status = 'suspended' WHERE id = ${organization}
      `.pipe(Effect.orDie)

      assert.deepStrictEqual(yield* jobs.drain, ["failed:StaleRecord"])
      assert.strictEqual(yield* pendingOrganizationOf(app, user.id), organization)
      assert.isNull((yield* me(user.browser)).organizationId)
    }),
  )
})
