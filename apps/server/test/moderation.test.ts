import { assert, describe, it } from "@effect/vitest"
import type { RpcResult } from "@petitionu/domain"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { insertPetition } from "./support/petitions.ts"
import { createOrganization, createUser } from "./support/users.ts"

const expectData = <A>(result: RpcResult<A>) => {
  if (!result.success) assert.fail(`expected success, got ${JSON.stringify(result.errors)}`)
  return result.data
}

const errorTypes = <A>(result: RpcResult<A>) =>
  result.success ? [] : result.errors.map((error) => error.type)

/**
 * The moderation test's setup: a school with a student reporter and an admin, another campus
 * with an admin and a superadmin, and the reporter's petition on the school campus.
 */
const makeModeration = Effect.gen(function* () {
  const app = yield* makeTestApp()
  const school = yield* createOrganization(app, { domain: "school.edu" })
  const other = yield* createOrganization(app, { domain: "other.edu" })
  const reporter = yield* createUser(app, { organizationId: school.id })
  const admin = yield* createUser(app, { organizationId: school.id, role: "admin" })
  const outsider = yield* createUser(app, { organizationId: other.id, role: "admin" })
  const superadmin = yield* createUser(app, { organizationId: other.id, role: "superadmin" })
  const petition = yield* insertPetition(app, {
    userId: reporter.id,
    organizationId: school.id,
    title: "Library",
    description: "Open later",
  })
  return { app, school, other, reporter, admin, outsider, superadmin, petition }
})

describe("content reports", () => {
  it.live("report campus is derived, and only scoped operators resolve, once", () =>
    Effect.gen(function* () {
      const { app, school, reporter, admin, outsider, petition } = yield* makeModeration

      const report = expectData(
        yield* reporter.browser.rpc((api) =>
          api.createContentReport({ petitionId: petition.id, reason: "privacy" }),
        ),
      )
      assert.deepInclude(report, {
        petitionId: petition.id,
        commentId: null,
        targetTitle: "Library",
        targetText: "Open later",
        reason: "privacy",
        details: null,
        state: "open",
        resolutionNote: null,
        resolvedAt: null,
      })
      const [row] = yield* app.sql<{ reporter_id: string; organization_id: string }>`
        SELECT reporter_id, organization_id FROM content_reports WHERE id = ${report.id}
      `.pipe(Effect.orDie)
      assert.deepStrictEqual({ ...row }, { reporter_id: reporter.id, organization_id: school.id })

      const own = expectData(yield* reporter.browser.rpc((api) => api.getContentReports({})))
      assert.deepStrictEqual(
        own.map((r) => r.id),
        [report.id],
      )
      assert.deepStrictEqual(
        expectData(yield* outsider.browser.rpc((api) => api.getContentReports({}))),
        [],
      )

      const input = {
        id: report.id,
        outcome: "resolved",
        resolutionNote: "Reviewed",
        hideContent: true,
      } as const
      assert.deepStrictEqual(
        errorTypes(yield* reporter.browser.rpc((api) => api.resolveContentReport(input))),
        ["forbidden"],
      )
      assert.deepStrictEqual(
        errorTypes(yield* outsider.browser.rpc((api) => api.resolveContentReport(input))),
        ["not_found"],
      )

      const resolved = expectData(
        yield* admin.browser.rpc((api) => api.resolveContentReport(input)),
      )
      assert.deepInclude(resolved, { id: report.id, state: "resolved", resolutionNote: "Reviewed" })
      assert.isNotNull(resolved.resolvedAt)
      const [audit] = yield* app.sql<{ resolver_id: string }>`
        SELECT resolver_id FROM content_reports WHERE id = ${report.id}
      `.pipe(Effect.orDie)
      assert.strictEqual(audit!.resolver_id, admin.id)

      assert.deepStrictEqual(yield* admin.browser.rpc((api) => api.resolveContentReport(input)), {
        success: false,
        errors: [{ type: "invalid", message: "This report has already been reviewed." }],
      })

      // The hidden petition is gone from reads and closed to participation and reports.
      assert.deepStrictEqual(
        expectData(yield* reporter.browser.rpc((api) => api.getPetitions({}))),
        [],
      )
      assert.deepStrictEqual(
        errorTypes(yield* reporter.browser.rpc((api) => api.getPetitionById({ id: petition.id }))),
        ["not_found"],
      )
      assert.deepStrictEqual(
        errorTypes(
          yield* reporter.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
        ),
        ["invalid"],
      )
      assert.deepStrictEqual(
        errorTypes(
          yield* reporter.browser.rpc((api) =>
            api.createComment({ petitionId: petition.id, text: "Hello" }),
          ),
        ),
        ["invalid"],
      )
      assert.deepStrictEqual(
        yield* reporter.browser.rpc((api) =>
          api.createContentReport({ petitionId: petition.id, reason: "privacy" }),
        ),
        {
          success: false,
          errors: [
            { type: "invalid", message: "This content is unavailable.", field: "petitionId" },
          ],
        },
      )
      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(
        errorTypes(yield* guest.rpc((api) => api.getPetitionById({ id: petition.id }))),
        ["not_found"],
      )
    }),
  )
})
