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

  it.live("requests from users without a campus are for superadmins only", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app, { domain: "school.edu" })
      const other = yield* createOrganization(app, { domain: "other.edu" })
      const admin = yield* createUser(app, { organizationId: school.id, role: "admin" })
      const superadmin = yield* createUser(app, { organizationId: other.id, role: "superadmin" })
      const unassigned = yield* createUser(app, { stage: "unconfirmed" })

      const created = yield* unassigned.browser.rpc((api) =>
        api.createSupportRequest({ kind: "support", message: "My campus is missing" }),
      )
      if (!created.success) return assert.fail(JSON.stringify(created))
      const id = created.data.id

      assert.deepStrictEqual(yield* admin.browser.rpc((api) => api.getSupportRequests({})), {
        success: true,
        data: [],
      })
      const byAdmin = yield* admin.browser.rpc((api) =>
        api.resolveSupportRequest({ id, resolutionNote: "Done" }),
      )
      assert.deepStrictEqual(errorTypes(byAdmin), ["not_found"])

      const queue = yield* superadmin.browser.rpc((api) =>
        api.getSupportRequests({ state: "open" }),
      )
      if (!queue.success) return assert.fail(JSON.stringify(queue))
      assert.deepStrictEqual(
        queue.data.map((request) => request.id),
        [id],
      )
      const resolved = yield* superadmin.browser.rpc((api) =>
        api.resolveSupportRequest({ id, resolutionNote: "Contacted campus" }),
      )
      assert.deepInclude(resolved, { success: true })
      assert.deepStrictEqual(
        yield* superadmin.browser.rpc((api) => api.getSupportRequests({ state: "open" })),
        { success: true, data: [] },
      )
      const reviewed = yield* superadmin.browser.rpc((api) =>
        api.getSupportRequests({ state: "resolved" }),
      )
      assert.deepStrictEqual(reviewed.success && reviewed.data.map((request) => request.id), [id])

      const guest = yield* makeBrowser(app)
      const byGuest = yield* guest.rpc((api) =>
        api.createSupportRequest({ kind: "support", message: "Guest" }),
      )
      assert.deepStrictEqual(errorTypes(byGuest), ["unauthenticated"])
    }),
  )

  it.live("messages and notes must be 1 to 5000 characters, and ownership can't be forged", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app, { domain: "school.edu" })
      const other = yield* createOrganization(app, { domain: "other.edu" })
      const reporter = yield* createUser(app, { organizationId: school.id })
      const admin = yield* createUser(app, { organizationId: school.id, role: "admin" })

      for (const message of ["   ", "x".repeat(5001)]) {
        const result = yield* reporter.browser.rpc((api) =>
          api.createSupportRequest({ kind: "support", message }),
        )
        assert.deepInclude(result, { success: false })
        if (!result.success)
          assert.deepInclude(result.errors[0], { type: "invalid", field: "message" })
      }

      const forged = yield* reporter.browser.rpc((api) =>
        api.createSupportRequest({
          kind: "support",
          message: "Help",
          organizationId: other.id,
          userId: admin.id,
        } as never),
      )
      if (!forged.success) return assert.fail(JSON.stringify(forged))
      const [row] = yield* app.sql<{ user_id: string; organization_id: string }>`
        SELECT user_id, organization_id FROM support_requests WHERE id = ${forged.data.id}
      `.pipe(Effect.orDie)
      assert.deepStrictEqual({ ...row }, { user_id: reporter.id, organization_id: school.id })

      const blank = yield* admin.browser.rpc((api) =>
        api.resolveSupportRequest({ id: forged.data.id, resolutionNote: "  " }),
      )
      assert.deepInclude(blank, { success: false })
      if (!blank.success)
        assert.deepInclude(blank.errors[0], { type: "invalid", field: "resolutionNote" })
    }),
  )

  it.live("the client reports every malformed field, worded as before", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app, { domain: "school.edu" })
      const admin = yield* createUser(app, { organizationId: school.id, role: "admin" })
      const malformed = yield* admin.browser.rpc((api) =>
        api.resolveSupportRequest({ id: "nope", resolutionNote: "   " }),
      )
      assert.deepStrictEqual(malformed, {
        success: false,
        errors: [
          { type: "invalid", field: "id", message: "is invalid" },
          {
            type: "invalid",
            field: "resolutionNote",
            message: "length must be greater than or equal to 1",
          },
        ],
      })
      const long = yield* admin.browser.rpc((api) =>
        api.createSupportRequest({ kind: "support", message: "x".repeat(5001) }),
      )
      assert.deepStrictEqual(long, {
        success: false,
        errors: [
          {
            type: "invalid",
            field: "message",
            message: "length must be less than or equal to 5000",
          },
        ],
      })
      // A field of the wrong type doesn't hide the others.
      const mistyped = yield* admin.browser.rpc((api) =>
        api.createSupportRequest({ kind: "zzz", message: "" } as never),
      )
      assert.deepStrictEqual(mistyped, {
        success: false,
        errors: [
          { type: "invalid", field: "kind", message: 'Expected "support" | "account_deletion"' },
          {
            type: "invalid",
            field: "message",
            message: "length must be greater than or equal to 1",
          },
        ],
      })
    }),
  )

  it.live("a malformed payload from outside the client never reaches the handler", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app, { domain: "school.edu" })
      const reporter = yield* createUser(app, { organizationId: school.id })
      const admin = yield* createUser(app, { organizationId: school.id, role: "admin" })
      const created = yield* reporter.browser.rpc((api) =>
        api.createSupportRequest({ kind: "support", message: "Help" }),
      )
      if (!created.success) return assert.fail(JSON.stringify(created))
      const token = yield* admin.browser.reloadCsrf
      const raw = (payload: unknown) =>
        Effect.gen(function* () {
          const response = yield* admin.browser.request("/rpc", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": token },
            body: JSON.stringify({
              _tag: "Request",
              id: "1",
              tag: "resolveSupportRequest",
              payload,
              headers: [],
            }),
          })
          return { status: response.status, body: yield* Effect.promise(() => response.json()) }
        })
      const defect = (message: string) => ({
        status: 200,
        body: [
          {
            _tag: "Exit",
            requestId: "1",
            exit: { _tag: "Failure", cause: [{ _tag: "Die", defect: message }] },
          },
        ],
      })

      // The server decodes the payload before any handler or query runs and answers with a
      // defect naming each field; only callers that skip the shared client see this.
      assert.deepStrictEqual(
        yield* raw({ id: created.data.id, resolutionNote: "  " }),
        defect('length must be greater than or equal to 1\n  at ["resolutionNote"]'),
      )
      assert.deepStrictEqual(
        yield* raw({ id: "nope'; --", resolutionNote: "x".repeat(5001) }),
        defect(
          'is invalid\n  at ["id"]\nlength must be less than or equal to 5000\n  at ["resolutionNote"]',
        ),
      )
      const [row] = yield* app.sql<{ state: string; resolution_note: string | null }>`
        SELECT state, resolution_note FROM support_requests WHERE id = ${created.data.id}
      `.pipe(Effect.orDie)
      assert.deepStrictEqual({ ...row }, { state: "open", resolution_note: null })
    }),
  )

  it.live("anyone can read the support mailbox", () =>
    Effect.gen(function* () {
      const configured = yield* makeTestApp({ env: { SUPPORT_EMAIL: "help@campus.test" } })
      const guest = yield* makeBrowser(configured)
      assert.deepStrictEqual(yield* guest.rpc((api) => api.supportContact()), {
        success: true,
        data: "help@campus.test",
      })
    }),
  )
})
