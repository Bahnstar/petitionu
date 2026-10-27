import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { me, organizationsAt, pendingOrganizationOf, schoolDomain } from "./support/campus.ts"
import { makeJobsApp } from "./support/jobs.ts"
import { confirmEmail, registerUser } from "./support/users.ts"

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
})
