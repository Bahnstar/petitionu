import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { createOrganization, createUser } from "./support/users.ts"

const errorTypes = (result: { success: boolean; errors?: ReadonlyArray<{ type: string }> }) =>
  result.success ? [] : result.errors!.map((error) => error.type)

describe("support requests", () => {
  it.live("requests persist, and only campus operators resolve them, once", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app, { domain: "school.edu" })
      const other = yield* createOrganization(app, { domain: "other.edu" })
      const reporter = yield* createUser(app, { organizationId: school.id })
      const admin = yield* createUser(app, { organizationId: school.id, role: "admin" })
      const outsider = yield* createUser(app, { organizationId: other.id, role: "admin" })

      for (const kind of ["support", "account_deletion"] as const) {
        const created = yield* reporter.browser.rpc((api) =>
          api.createSupportRequest({ kind, message: "  Please help with my account  " }),
        )
        if (!created.success) return assert.fail(JSON.stringify(created))
        assert.deepInclude(created.data, {
          kind,
          message: "Please help with my account",
          requesterEmail: reporter.email,
          state: "open",
          resolutionNote: null,
          resolvedAt: null,
        })
        const id = created.data.id

        const byOwner = yield* reporter.browser.rpc((api) =>
          api.resolveSupportRequest({ id, resolutionNote: "Done" }),
        )
        assert.deepStrictEqual(errorTypes(byOwner), ["forbidden"])
        const byOutsider = yield* outsider.browser.rpc((api) =>
          api.resolveSupportRequest({ id, resolutionNote: "Done" }),
        )
        assert.deepStrictEqual(errorTypes(byOutsider), ["not_found"])

        const resolved = yield* admin.browser.rpc((api) =>
          api.resolveSupportRequest({ id, resolutionNote: " Contacted the requester " }),
        )
        if (!resolved.success) return assert.fail(JSON.stringify(resolved))
        assert.deepInclude(resolved.data, {
          id,
          state: "resolved",
          resolutionNote: "Contacted the requester",
        })
        assert.isNotNull(resolved.data.resolvedAt)
        const [row] = yield* app.sql<{ resolver_id: string }>`
          SELECT resolver_id FROM support_requests WHERE id = ${id}
        `.pipe(Effect.orDie)
        assert.strictEqual(row!.resolver_id, admin.id)

        const again = yield* admin.browser.rpc((api) =>
          api.resolveSupportRequest({ id, resolutionNote: "Again" }),
        )
        assert.deepStrictEqual(again, {
          success: false,
          errors: [{ type: "invalid", message: "This request has already been resolved." }],
        })
      }

      const stillThere = yield* reporter.browser.rpc((api) => api.getMe())
      assert.deepInclude(stillThere, { success: true })
      const mine = yield* reporter.browser.rpc((api) => api.getMySupportRequests())
      if (!mine.success) return assert.fail(JSON.stringify(mine))
      assert.deepStrictEqual(
        mine.data.map((request) => request.kind),
        ["account_deletion", "support"],
      )
      const outsiderView = yield* outsider.browser.rpc((api) => api.getSupportRequests({}))
      assert.deepStrictEqual(outsiderView, { success: true, data: [] })
    }),
  )
})
