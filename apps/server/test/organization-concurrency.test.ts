import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { organizationsAt, pendingOrganizationOf, schoolDomain } from "./support/campus.ts"
import { makeJobsApp } from "./support/jobs.ts"
import { lastEmailedToken, registerUser } from "./support/users.ts"

describe("organization concurrency", () => {
  it.live("competing first sign-ups at a new school converge on one organization", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const domain = schoolDomain()
      const users = yield* Effect.forEach([1, 2, 3, 4], (n) =>
        registerUser(app, { email: `student${n}@${domain}` }),
      )
      const tokens = yield* Effect.forEach(users, (user) => lastEmailedToken(app, user.email))

      // Each confirmation runs in its own transaction on its own connection.
      const confirmations = yield* Effect.forEach(
        users,
        (user, i) => user.browser.authGet(`/verify-email?token=${encodeURIComponent(tokens[i]!)}`),
        { concurrency: "unbounded" },
      )
      assert.deepStrictEqual(
        confirmations.map((response) => response.status),
        [200, 200, 200, 200],
      )

      const organizations = yield* organizationsAt(app, domain)
      assert.lengthOf(organizations, 1)
      for (const user of users) {
        assert.strictEqual(yield* pendingOrganizationOf(app, user.id), organizations[0]!.id)
        assert.lengthOf(yield* jobs.jobsFor(user.id), 1)
      }
    }),
  )
})
