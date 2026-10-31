import { assert, describe, it } from "@effect/vitest"
import type { RpcResult } from "@petitionu/domain"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { insertClassroom, upsertMembership } from "./support/classrooms.ts"
import { insertPetition, updatePetitionRow } from "./support/petitions.ts"
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

  it.live(
    "a comment report targets the comment's petition, and hiding it leaves the petition",
    () =>
      Effect.gen(function* () {
        const { app, reporter, superadmin, petition } = yield* makeModeration
        const comment = expectData(
          yield* reporter.browser.rpc((api) =>
            api.createComment({ petitionId: petition.id, text: "Personal information" }),
          ),
        )

        const report = expectData(
          yield* reporter.browser.rpc((api) =>
            api.createContentReport({
              commentId: comment.id,
              petitionId: crypto.randomUUID(),
              reason: "privacy",
            }),
          ),
        )
        assert.deepInclude(report, {
          petitionId: petition.id,
          commentId: comment.id,
          targetTitle: "Library",
          targetText: "Personal information",
        })

        expectData(
          yield* superadmin.browser.rpc((api) =>
            api.resolveContentReport({
              id: report.id,
              outcome: "resolved",
              resolutionNote: "Removed personal information",
              hideContent: true,
            }),
          ),
        )

        assert.deepStrictEqual(
          expectData(yield* reporter.browser.rpc((api) => api.getComments({}))),
          [],
        )
        const detail = expectData(
          yield* reporter.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
        )
        assert.deepStrictEqual("comments" in detail && detail.comments, [])
        assert.deepStrictEqual(
          expectData(yield* reporter.browser.rpc((api) => api.getPetitions({}))).map((p) => p.id),
          [petition.id],
        )
        // A hidden comment can't be reported again or replied to.
        assert.deepStrictEqual(
          yield* reporter.browser.rpc((api) =>
            api.createContentReport({ commentId: comment.id, reason: "privacy" }),
          ),
          {
            success: false,
            errors: [
              { type: "invalid", message: "This content is unavailable.", field: "petitionId" },
            ],
          },
        )
        assert.deepStrictEqual(
          errorTypes(
            yield* reporter.browser.rpc((api) =>
              api.createComment({
                petitionId: petition.id,
                text: "Again",
                parentCommentId: comment.id,
              }),
            ),
          ),
          ["invalid"],
        )
        const [row] = yield* app.sql<{ hidden: boolean }>`
        SELECT hidden_at IS NOT NULL AS hidden FROM comment WHERE id = ${comment.id}
      `.pipe(Effect.orDie)
        assert.isTrue(row!.hidden)
      }),
  )

  describe("replies", () => {
    /** A comment by the reporter with a reply from a classmate, and their report helpers. */
    const replied = Effect.gen(function* () {
      const moderation = yield* makeModeration
      const { app, school, reporter, admin, petition } = moderation
      const classmate = yield* createUser(app, {
        organizationId: school.id,
        firstName: "Grace",
        lastName: "Hopper",
      })
      const comment = expectData(
        yield* classmate.browser.rpc((api) =>
          api.createComment({ petitionId: petition.id, text: "Parent's secret text" }),
        ),
      )
      const reply = expectData(
        yield* reporter.browser.rpc((api) =>
          api.createComment({
            petitionId: petition.id,
            text: "A reply",
            parentCommentId: comment.id,
          }),
        ),
      )
      const hide = (commentId: string) =>
        Effect.gen(function* () {
          const report = expectData(
            yield* reporter.browser.rpc((api) =>
              api.createContentReport({ commentId, reason: "harassment" }),
            ),
          )
          expectData(
            yield* admin.browser.rpc((api) =>
              api.resolveContentReport({
                id: report.id,
                outcome: "resolved",
                resolutionNote: "Removed",
                hideContent: true,
              }),
            ),
          )
          return report
        })
      const page = Effect.map(
        reporter.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
        (result) => {
          const detail = expectData(result)
          return "comments" in detail ? detail.comments : assert.fail("no comments for a user")
        },
      )
      return { ...moderation, classmate, comment, reply, hide, page }
    })

    it.live("a report on a reply snapshots the reply, and hiding it leaves the parent", () =>
      Effect.gen(function* () {
        const { reporter, petition, comment, reply, hide, page } = yield* replied
        const report = yield* hide(reply.id)
        assert.deepInclude(report, {
          petitionId: petition.id,
          commentId: reply.id,
          targetText: "A reply",
        })
        assert.deepStrictEqual(
          (yield* page).map((c) => c.id),
          [comment.id],
        )
        assert.deepStrictEqual(
          errorTypes(
            yield* reporter.browser.rpc((api) =>
              api.createComment({
                petitionId: petition.id,
                text: "Again",
                parentCommentId: reply.id,
              }),
            ),
          ),
          ["invalid"],
        )
      }),
    )

    it.live("hiding a comment keeps its replies, and nothing of it reaches a reader", () =>
      Effect.gen(function* () {
        const { reporter, classmate, petition, comment, reply, hide, page } = yield* replied
        yield* hide(comment.id)

        const replies = yield* page
        assert.deepStrictEqual(
          replies.map((c) => [c.id, c.parentCommentId]),
          [[reply.id, comment.id]],
        )
        const listed = expectData(
          yield* reporter.browser.rpc((api) => api.getComments({ petitionId: petition.id })),
        )
        for (const read of [replies, listed]) {
          assert.notInclude(JSON.stringify(read), "Parent's secret text")
          assert.notInclude(JSON.stringify(read), "Grace Hopper")
        }

        // Replying in the thread stays open and returns none of the hidden comment either.
        const later = expectData(
          yield* classmate.browser.rpc((api) =>
            api.createComment({
              petitionId: petition.id,
              text: "Later",
              parentCommentId: reply.id,
            }),
          ),
        )
        assert.strictEqual(later.parentCommentId, comment.id)
        assert.notInclude(JSON.stringify(later), "Parent's secret text")
      }),
    )

    it.live("a reply under a hidden comment can still be reported and hidden", () =>
      Effect.gen(function* () {
        const { comment, reply, hide, page } = yield* replied
        yield* hide(comment.id)
        const report = yield* hide(reply.id)
        assert.deepInclude(report, { commentId: reply.id, targetText: "A reply" })
        assert.deepStrictEqual(yield* page, [])
      }),
    )
  })

  it.live("an invalid or dismissed resolution can't hide content, and dismissing keeps it", () =>
    Effect.gen(function* () {
      const { reporter, admin, petition } = yield* makeModeration
      const report = expectData(
        yield* reporter.browser.rpc((api) =>
          api.createContentReport({ petitionId: petition.id, reason: "privacy" }),
        ),
      )
      const resolve = (input: {
        outcome: "resolved" | "dismissed"
        resolutionNote: string
        hideContent?: boolean
      }) => admin.browser.rpc((api) => api.resolveContentReport({ id: report.id, ...input }))
      const stillVisible = Effect.gen(function* () {
        const petitions = expectData(yield* reporter.browser.rpc((api) => api.getPetitions({})))
        assert.deepStrictEqual(
          petitions.map((p) => p.id),
          [petition.id],
        )
      })

      const blank = yield* resolve({ outcome: "resolved", resolutionNote: "  ", hideContent: true })
      assert.deepStrictEqual(blank, {
        success: false,
        errors: [
          {
            type: "invalid",
            message: "length must be greater than or equal to 1",
            field: "resolutionNote",
          },
        ],
      })
      assert.deepStrictEqual(
        yield* resolve({ outcome: "dismissed", resolutionNote: "No violation", hideContent: true }),
        {
          success: false,
          errors: [{ type: "invalid", message: "Dismissed reports cannot hide content." }],
        },
      )
      yield* stillVisible

      const dismissed = expectData(
        yield* resolve({ outcome: "dismissed", resolutionNote: " No violation " }),
      )
      assert.deepInclude(dismissed, { state: "dismissed", resolutionNote: "No violation" })
      yield* stillVisible

      const queue = (state?: "open" | "dismissed") =>
        Effect.map(
          admin.browser.rpc((api) => api.getContentReports(state ? { state } : {})),
          (result) => expectData(result).map((r) => r.id),
        )
      assert.deepStrictEqual(yield* queue("open"), [])
      assert.deepStrictEqual(yield* queue("dismissed"), [report.id])
      assert.deepStrictEqual(yield* queue(), [report.id])
    }),
  )

  it.live("guests, unconfirmed users and removed classroom members can't report", () =>
    Effect.gen(function* () {
      const { app, reporter, admin, petition } = yield* makeModeration
      const classroom = yield* insertClassroom(app, { professorId: admin.id })
      yield* updatePetitionRow(app, petition.id, { classroom_id: classroom.id })
      yield* upsertMembership(app, {
        classroomId: classroom.id,
        userId: reporter.id,
        status: "removed",
      })
      const report = { petitionId: petition.id, reason: "spam" } as const

      assert.deepStrictEqual(
        yield* reporter.browser.rpc((api) => api.createContentReport(report)),
        {
          success: false,
          errors: [
            { type: "invalid", message: "This content is unavailable.", field: "petitionId" },
          ],
        },
      )
      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(yield* guest.rpc((api) => api.createContentReport(report)), {
        success: false,
        errors: [{ type: "unauthenticated", message: "Sign in to participate." }],
      })
      const unconfirmed = yield* createUser(app, { stage: "unconfirmed" })
      assert.deepStrictEqual(
        yield* unconfirmed.browser.rpc((api) => api.createContentReport(report)),
        {
          success: false,
          errors: [{ type: "invalid", message: "Confirm your email before participating." }],
        },
      )
      // The professor, who can see the classroom petition, can report it.
      expectData(yield* admin.browser.rpc((api) => api.createContentReport(report)))
    }),
  )

  it.live("reports need a target, and ownership and campus can't be forged", () =>
    Effect.gen(function* () {
      const { app, school, other, reporter, admin, petition } = yield* makeModeration
      const unavailable = {
        success: false as const,
        errors: [{ type: "invalid", message: "This content is unavailable.", field: "petitionId" }],
      }
      for (const input of [{}, { petitionId: "not-a-uuid" }, { petitionId: crypto.randomUUID() }]) {
        assert.deepStrictEqual(
          yield* reporter.browser.rpc((api) =>
            api.createContentReport({ reason: "spam", ...input }),
          ),
          unavailable,
        )
      }

      const oversized = yield* reporter.browser.rpc((api) =>
        api.createContentReport({
          petitionId: petition.id,
          reason: "spam",
          details: "x".repeat(5001),
        }),
      )
      assert.deepStrictEqual(oversized, {
        success: false,
        errors: [
          {
            type: "invalid",
            message: "length must be less than or equal to 5000",
            field: "details",
          },
        ],
      })

      const forged = expectData(
        yield* reporter.browser.rpc((api) =>
          api.createContentReport({
            petitionId: petition.id,
            reason: "spam",
            details: "  Looks like spam  ",
            reporterId: admin.id,
            organizationId: other.id,
            state: "resolved",
          } as never),
        ),
      )
      assert.deepInclude(forged, { details: "Looks like spam", state: "open" })
      const [row] = yield* app.sql<{ reporter_id: string; organization_id: string }>`
        SELECT reporter_id, organization_id FROM content_reports WHERE id = ${forged.id}
      `.pipe(Effect.orDie)
      assert.deepStrictEqual({ ...row }, { reporter_id: reporter.id, organization_id: school.id })
    }),
  )

  it.live("campus-less reports are for superadmins", () =>
    Effect.gen(function* () {
      const { app, reporter, admin, superadmin, petition } = yield* makeModeration
      yield* updatePetitionRow(app, petition.id, { organization_id: null })
      const report = expectData(
        yield* reporter.browser.rpc((api) =>
          api.createContentReport({ petitionId: petition.id, reason: "spam" }),
        ),
      )
      const input = {
        id: report.id,
        outcome: "resolved",
        resolutionNote: "Reviewed",
        hideContent: true,
      } as const
      assert.deepStrictEqual(
        expectData(yield* admin.browser.rpc((api) => api.getContentReports({}))),
        [],
      )
      assert.deepStrictEqual(
        errorTypes(yield* admin.browser.rpc((api) => api.resolveContentReport(input))),
        ["not_found"],
      )
      expectData(yield* superadmin.browser.rpc((api) => api.resolveContentReport(input)))
    }),
  )

  it.live("a hide the moderator isn't allowed rolls back the whole resolution", () =>
    Effect.gen(function* () {
      const { app, other, reporter, admin, petition } = yield* makeModeration
      const report = expectData(
        yield* reporter.browser.rpc((api) =>
          api.createContentReport({ petitionId: petition.id, reason: "spam" }),
        ),
      )
      // The petition moved campus after it was reported: the report's admin can't hide it.
      yield* updatePetitionRow(app, petition.id, { organization_id: other.id })
      const hidden = yield* admin.browser.rpc((api) =>
        api.resolveContentReport({
          id: report.id,
          outcome: "resolved",
          resolutionNote: "Review",
          hideContent: true,
        }),
      )
      assert.deepStrictEqual(errorTypes(hidden), ["forbidden"])
      const [row] = yield* app.sql<{ state: string; hidden: boolean }>`
        SELECT r.state, p.hidden_at IS NOT NULL AS hidden
        FROM content_reports r JOIN petition p ON p.id = r.petition_id WHERE r.id = ${report.id}
      `.pipe(Effect.orDie)
      assert.deepStrictEqual({ ...row }, { state: "open", hidden: false })
    }),
  )

  it.live("resolving an unknown report is not found, and a malformed id is invalid", () =>
    Effect.gen(function* () {
      const { app, superadmin } = yield* makeModeration
      const resolve = (id: string) =>
        superadmin.browser.rpc((api) =>
          api.resolveContentReport({ id, outcome: "dismissed", resolutionNote: "x" }),
        )
      assert.deepStrictEqual(yield* resolve(crypto.randomUUID()), {
        success: false,
        errors: [{ type: "not_found", message: "Content report not found" }],
      })
      assert.deepStrictEqual(yield* resolve("nope"), {
        success: false,
        errors: [{ type: "invalid", field: "id", message: "is invalid" }],
      })
      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(errorTypes(yield* guest.rpc((api) => api.getContentReports({}))), [
        "unauthenticated",
      ])
    }),
  )

  it.live("two moderators resolving at once review the report exactly once", () =>
    Effect.gen(function* () {
      const { reporter, admin, superadmin, petition } = yield* makeModeration
      const report = expectData(
        yield* reporter.browser.rpc((api) =>
          api.createContentReport({ petitionId: petition.id, reason: "spam" }),
        ),
      )
      const results = yield* Effect.all(
        [admin, superadmin].map((moderator) =>
          moderator.browser.rpc((api) =>
            api.resolveContentReport({
              id: report.id,
              outcome: "dismissed",
              resolutionNote: "No violation",
            }),
          ),
        ),
        { concurrency: "unbounded" },
      )
      assert.deepStrictEqual(results.map((result) => result.success).sort(), [false, true])
      assert.deepInclude(
        results.find((result) => !result.success),
        {
          errors: [{ type: "invalid", message: "This report has already been reviewed." }],
        },
      )
    }),
  )
})
