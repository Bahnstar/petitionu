import { assert, describe, it } from "@effect/vitest"
import type { ApiClient, RpcResult } from "@petitionu/domain"
import { Effect, Fiber } from "effect"
import { makeTestApp } from "./support/harness.ts"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { insertClassroom, setClassroomArchived, upsertMembership } from "./support/classrooms.ts"
import { insertPetition, updatePetitionRow } from "./support/petitions.ts"
import { createOrganization, createUser } from "./support/users.ts"
import type { TestApp } from "./support/harness.ts"

const expectErrors = (
  result: { success: true; data: unknown } | { success: false; errors: ReadonlyArray<unknown> },
) => {
  if (result.success) assert.fail(`expected failure, got ${JSON.stringify(result.data)}`)
  return result.errors
}

const expectData = <A>(
  result: { success: true; data: A } | { success: false; errors: unknown },
) => {
  if (!result.success) assert.fail(`expected success, got ${JSON.stringify(result.errors)}`)
  return result.data
}

/** One procedure call, for tables of calls. */
type Call = (api: ApiClient) => Promise<RpcResult<unknown>>
const calls = (...list: Array<Call>) => list
/** Calls that return lists. */
const listCalls = (
  ...list: Array<(api: ApiClient) => Promise<RpcResult<ReadonlyArray<unknown>>>>
) => list

const count = (app: TestApp, table: "signature" | "comment" | "update") =>
  app.sql<{ count: number }>`SELECT count(*)::int AS count FROM ${app.sql(table)}`.pipe(
    Effect.map((rows) => rows[0]!.count),
    Effect.orDie,
  )

/** A test app with one campus; `newStudent()` creates a complete student there. */
const makeCampus = Effect.gen(function* () {
  const app = yield* makeTestApp()
  const school = yield* createOrganization(app, { domain: "school.edu" })
  const newStudent = (options: Parameters<typeof createUser>[1] = {}) =>
    createUser(app, { organizationId: school.id, ...options })
  return { app, school, newStudent }
})

describe("signatures", () => {
  it.live("a student signs a campus petition once, and the signature is theirs", () =>
    Effect.gen(function* () {
      const { app, school, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id, organizationId: school.id })

      const signature = expectData(
        yield* signer.browser.rpc((api) =>
          api.createSignature({ petitionId: petition.id, reason: "  More study time  " }),
        ),
      )
      assert.include(signature, {
        petitionId: petition.id,
        reason: "More study time",
        isVerified: true,
      })
      const read = expectData(
        yield* signer.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
      )
      assert.include(read, { hasSigned: true, signaturesCount: 1 })

      assert.deepStrictEqual(
        expectErrors(
          yield* signer.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
        ),
        [{ type: "invalid", field: "petitionId", message: "has already been taken" }],
      )
    }),
  )

  it.live("only confirmed users with a complete profile may sign", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })
      const sign = { petitionId: petition.id }

      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(expectErrors(yield* guest.rpc((api) => api.createSignature(sign))), [
        { type: "unauthenticated", message: "Sign in to participate." },
      ])
      const unconfirmed = yield* createUser(app, { stage: "unconfirmed" })
      assert.deepStrictEqual(
        expectErrors(yield* unconfirmed.browser.rpc((api) => api.createSignature(sign))),
        [{ type: "invalid", message: "Confirm your email before participating." }],
      )
      const incomplete = yield* createUser(app, { stage: "confirmed" })
      for (const call of calls(
        (api) => api.createSignature(sign),
        (api) => api.createComment({ ...sign, text: "Hello" }),
      )) {
        assert.deepStrictEqual(expectErrors(yield* incomplete.browser.rpc(call)), [
          { type: "invalid", message: "Complete your campus profile before participating." },
        ])
      }
      assert.strictEqual(yield* count(app, "signature"), 0)
    }),
  )

  it.live("closed petitions and petitions past their deadline reject signatures", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      for (const [columns, message] of [
        [{ status: "closed" }, "This petition is closed."],
        [{ status: "victory" }, "This petition is closed."],
        [{ deadline: new Date(Date.now() - 60_000) }, "This petition's deadline has passed."],
      ] as const) {
        const petition = yield* insertPetition(app, { userId: owner.id })
        yield* updatePetitionRow(app, petition.id, columns)
        assert.deepStrictEqual(
          expectErrors(
            yield* signer.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
          ),
          [{ type: "invalid", field: "petitionId", message }],
        )
      }
      const later = yield* insertPetition(app, { userId: owner.id })
      yield* updatePetitionRow(app, later.id, { deadline: new Date(Date.now() + 86_400_000) })
      expectData(yield* signer.browser.rpc((api) => api.createSignature({ petitionId: later.id })))
    }),
  )

  it.live("campus petitions take outside signatures only when the campus allows them", () =>
    Effect.gen(function* () {
      const { app, school, newStudent } = yield* makeCampus
      const other = yield* createOrganization(app, { domain: "other.edu" })
      const owner = yield* newStudent()
      const outsider = yield* createUser(app, { organizationId: other.id })
      const petition = yield* insertPetition(app, { userId: owner.id, organizationId: school.id })
      const sign = (api: ApiClient) => api.createSignature({ petitionId: petition.id })

      assert.deepStrictEqual(expectErrors(yield* outsider.browser.rpc(sign)), [
        {
          type: "invalid",
          field: "petitionId",
          message: "Only students at this campus can sign this petition.",
        },
      ])
      yield* app.sql`UPDATE organization SET allow_public_signatures = true WHERE id = ${school.id}`
      expectData(yield* outsider.browser.rpc(sign))
    }),
  )

  it.live("unknown, hidden and other classrooms' petitions are unavailable", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const professor = yield* newStudent()
      const student = yield* newStudent()
      const classroom = yield* insertClassroom(app, { professorId: professor.id })
      const inClassroom = yield* insertPetition(app, {
        userId: professor.id,
        classroomId: classroom.id,
      })
      const hidden = yield* insertPetition(app, { userId: professor.id })
      yield* updatePetitionRow(app, hidden.id, { hidden_at: new Date() })
      const unavailable = [
        { type: "invalid", field: "petitionId", message: "This petition is unavailable." },
      ]
      for (const petitionId of [inClassroom.id, hidden.id, crypto.randomUUID()]) {
        assert.deepStrictEqual(
          expectErrors(yield* student.browser.rpc((api) => api.createSignature({ petitionId }))),
          unavailable,
          petitionId,
        )
        assert.deepStrictEqual(
          expectErrors(
            yield* student.browser.rpc((api) => api.createComment({ petitionId, text: "Hi" })),
          ),
          unavailable,
          petitionId,
        )
      }
      // A malformed id is rejected as a payload, before the call.
      const malformed = [{ type: "invalid", field: "petitionId", message: "is invalid" }]
      assert.deepStrictEqual(
        expectErrors(
          yield* student.browser.rpc((api) => api.createSignature({ petitionId: "nope" })),
        ),
        malformed,
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* student.browser.rpc((api) =>
            api.createComment({ petitionId: "nope", text: "Hi" }),
          ),
        ),
        malformed,
      )

      yield* upsertMembership(app, { classroomId: classroom.id, userId: student.id })
      expectData(
        yield* student.browser.rpc((api) => api.createSignature({ petitionId: inClassroom.id })),
      )
      yield* setClassroomArchived(app, classroom.id, true)
      assert.deepStrictEqual(
        expectErrors(
          yield* professor.browser.rpc((api) =>
            api.createComment({ petitionId: inClassroom.id, text: "Archived" }),
          ),
        ),
        [
          {
            type: "invalid",
            field: "petitionId",
            message: "This classroom is archived or unavailable.",
          },
        ],
      )
    }),
  )
})

describe("withdrawing a signature", () => {
  it.live("a student withdraws their own signature, which then no longer counts", () =>
    Effect.gen(function* () {
      const { app, school, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const other = yield* newStudent()
      const petition = yield* insertPetition(app, {
        userId: owner.id,
        organizationId: school.id,
        goal: 10,
      })
      const petitionId = petition.id
      // Six signatures on a goal of ten is trending; five isn't.
      for (const user of [signer, other]) {
        expectData(yield* user.browser.rpc((api) => api.createSignature({ petitionId })))
      }
      for (let n = 0; n < 4; n++) {
        const extra = yield* newStudent()
        expectData(yield* extra.browser.rpc((api) => api.createSignature({ petitionId })))
      }
      assert.include(
        expectData(yield* signer.browser.rpc((api) => api.getPetitionById({ id: petitionId }))),
        { hasSigned: true, signaturesCount: 6, trending: true },
      )

      expectData(yield* signer.browser.rpc((api) => api.deleteSignature({ petitionId })))
      assert.include(
        expectData(yield* signer.browser.rpc((api) => api.getPetitionById({ id: petitionId }))),
        { hasSigned: false, signaturesCount: 5, trending: false },
      )
      // Only the caller's own signature goes.
      assert.include(
        expectData(yield* other.browser.rpc((api) => api.getPetitionById({ id: petitionId }))),
        { hasSigned: true },
      )
      assert.deepStrictEqual(
        expectErrors(yield* signer.browser.rpc((api) => api.deleteSignature({ petitionId }))),
        [{ type: "invalid", field: "petitionId", message: "You haven't signed this petition." }],
      )
      // Withdrawing isn't final: the student may sign again.
      expectData(yield* signer.browser.rpc((api) => api.createSignature({ petitionId })))
      assert.strictEqual(yield* count(app, "signature"), 6)
    }),
  )

  it.live("a petition that no longer takes signatures keeps them, with signing's messages", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const professor = yield* newStudent()
      const signer = yield* newStudent()
      const classroom = yield* insertClassroom(app, { professorId: professor.id })
      yield* upsertMembership(app, { classroomId: classroom.id, userId: signer.id })
      const signed = (options: { classroomId?: string } = {}) =>
        Effect.gen(function* () {
          const petition = yield* insertPetition(app, { userId: professor.id, ...options })
          expectData(
            yield* signer.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
          )
          return petition.id
        })
      const withdraw = (petitionId: string) =>
        signer.browser.rpc((api) => api.deleteSignature({ petitionId }))

      for (const [columns, message] of [
        [{ status: "closed" }, "This petition is closed."],
        [{ status: "victory" }, "This petition is closed."],
        [{ deadline: new Date(Date.now() - 60_000) }, "This petition's deadline has passed."],
        [{ hidden_at: new Date() }, "This petition is unavailable."],
      ] as const) {
        const petitionId = yield* signed()
        yield* updatePetitionRow(app, petitionId, columns)
        assert.deepStrictEqual(
          expectErrors(yield* withdraw(petitionId)),
          [{ type: "invalid", field: "petitionId", message }],
          JSON.stringify(columns),
        )
      }
      const inClassroom = yield* signed({ classroomId: classroom.id })
      yield* setClassroomArchived(app, classroom.id, true)
      assert.deepStrictEqual(expectErrors(yield* withdraw(inClassroom)), [
        {
          type: "invalid",
          field: "petitionId",
          message: "This classroom is archived or unavailable.",
        },
      ])
      assert.strictEqual(yield* count(app, "signature"), 5)

      // Signing needs the right campus; withdrawing doesn't.
      const school = yield* createOrganization(app, { domain: "public.edu" })
      yield* app.sql`UPDATE organization SET allow_public_signatures = true WHERE id = ${school.id}`
      const campusPetition = yield* insertPetition(app, {
        userId: professor.id,
        organizationId: school.id,
      })
      expectData(
        yield* signer.browser.rpc((api) => api.createSignature({ petitionId: campusPetition.id })),
      )
      yield* app.sql`UPDATE organization SET allow_public_signatures = false WHERE id = ${school.id}`
      expectData(yield* withdraw(campusPetition.id))
    }),
  )

  it.live("guests and users who can't participate can't withdraw", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })
      const withdraw = { petitionId: petition.id }
      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(
        expectErrors(yield* guest.rpc((api) => api.deleteSignature(withdraw))),
        [{ type: "unauthenticated", message: "Sign in to participate." }],
      )
      const unconfirmed = yield* createUser(app, { stage: "unconfirmed" })
      assert.deepStrictEqual(
        expectErrors(yield* unconfirmed.browser.rpc((api) => api.deleteSignature(withdraw))),
        [{ type: "invalid", message: "Confirm your email before participating." }],
      )
    }),
  )

  it.live("a withdrawal waiting on a petition that is being closed is rejected", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })
      expectData(
        yield* signer.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
      )

      // Hold the petition's row lock, as closing does, while the withdrawal arrives.
      const withdrawing = yield* Effect.gen(function* () {
        yield* app.sql`SELECT id FROM petition WHERE id = ${petition.id} FOR UPDATE`
        const withdrawing = yield* Effect.forkChild(
          signer.browser.rpc((api) => api.deleteSignature({ petitionId: petition.id })),
        )
        yield* waitForLockWaiter(app)
        yield* app.sql`UPDATE petition SET status = 'closed' WHERE id = ${petition.id}`
        return withdrawing
      }).pipe(app.sql.withTransaction, Effect.orDie)

      assert.deepStrictEqual(expectErrors(yield* Fiber.join(withdrawing)), [
        { type: "invalid", field: "petitionId", message: "This petition is closed." },
      ])
      assert.strictEqual(yield* count(app, "signature"), 1)
    }),
  )
})

describe("comments", () => {
  it.live("a student comments and replies, with author names; client user ids are ignored", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent({ firstName: "Private", lastName: "Owner" })
      const commenter = yield* newStudent({ firstName: "Ada", lastName: "Lovelace" })
      const petition = yield* insertPetition(app, { userId: owner.id, isAnonymous: true })

      const comment = expectData(
        yield* commenter.browser.rpc((api) =>
          api.createComment({
            petitionId: petition.id,
            text: "  Love this!  ",
            userId: owner.id,
          } as never),
        ),
      )
      assert.include(comment, {
        petitionId: petition.id,
        text: "Love this!",
        author: "Ada Lovelace",
        parentCommentId: null,
      })
      const [row] = yield* app.sql<{ user_id: string }>`
        SELECT user_id FROM comment WHERE id = ${comment.id}`
      assert.strictEqual(row!.user_id, commenter.id)

      const reply = expectData(
        yield* owner.browser.rpc((api) =>
          api.createComment({
            petitionId: petition.id,
            text: "Thanks",
            parentCommentId: comment.id,
          }),
        ),
      )
      assert.strictEqual(reply.parentCommentId, comment.id)
      // Comment authors are named even on anonymous petitions, as in Ash.
      assert.deepStrictEqual(
        expectData(
          yield* commenter.browser.rpc((api) => api.getComments({ petitionId: petition.id })),
        ).map((c) => [c.text, c.author]),
        [
          ["Love this!", "Ada Lovelace"],
          ["Thanks", "Private Owner"],
        ],
      )
    }),
  )

  it.live("blank, long, disabled and misplaced comments are rejected", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const commenter = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })
      const other = yield* insertPetition(app, { userId: owner.id })
      const elsewhere = expectData(
        yield* owner.browser.rpc((api) => api.createComment({ petitionId: other.id, text: "Hi" })),
      )
      const comment = (input: { text?: string; parentCommentId?: string }) =>
        commenter.browser.rpc((api) =>
          api.createComment({ petitionId: petition.id, text: "Reply", ...input }),
        )

      for (const [input, expected] of [
        [{ text: "   " }, { field: "text", message: "must be present" }],
        [
          { text: "x".repeat(5001) },
          { field: "text", message: "length must be less than or equal to 5000" },
        ],
        [
          { parentCommentId: elsewhere.id },
          { field: "parentCommentId", message: "Reply to a comment in this petition." },
        ],
        [{ parentCommentId: "not-a-comment" }, { field: "parentCommentId", message: "is invalid" }],
      ] as const) {
        assert.deepStrictEqual(
          expectErrors(yield* comment(input)),
          [{ type: "invalid", ...expected }],
          JSON.stringify(input).slice(0, 80),
        )
      }

      yield* updatePetitionRow(app, petition.id, { allow_comments: false })
      assert.deepStrictEqual(expectErrors(yield* comment({})), [
        {
          type: "invalid",
          field: "petitionId",
          message: "Comments are disabled for this petition.",
        },
      ])
      yield* updatePetitionRow(app, petition.id, { allow_comments: true, status: "closed" })
      assert.deepStrictEqual(expectErrors(yield* comment({})), [
        { type: "invalid", field: "petitionId", message: "This petition is closed." },
      ])
      assert.strictEqual(yield* count(app, "comment"), 1)
    }),
  )

  it.live("hidden comments, and replies to them, are unavailable", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })
      const hidden = expectData(
        yield* owner.browser.rpc((api) =>
          api.createComment({ petitionId: petition.id, text: "Rude" }),
        ),
      )
      expectData(
        yield* owner.browser.rpc((api) =>
          api.createComment({ petitionId: petition.id, text: "Kind" }),
        ),
      )
      yield* app.sql`UPDATE comment SET hidden_at = now() WHERE id = ${hidden.id}`

      assert.deepStrictEqual(
        expectData(yield* owner.browser.rpc((api) => api.getComments({}))).map((c) => c.text),
        ["Kind"],
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* owner.browser.rpc((api) =>
            api.createComment({ petitionId: petition.id, text: "Re", parentCommentId: hidden.id }),
          ),
        ),
        [
          {
            type: "invalid",
            field: "parentCommentId",
            message: "Reply to a comment in this petition.",
          },
        ],
      )
    }),
  )
})

describe("editing and deleting comments", () => {
  /** A campus with a petition and one comment on it by `author`. */
  const commented = Effect.gen(function* () {
    const campus = yield* makeCampus
    const author = yield* campus.newStudent({ firstName: "Ada", lastName: "Lovelace" })
    const other = yield* campus.newStudent()
    const petition = yield* insertPetition(campus.app, {
      userId: other.id,
      organizationId: campus.school.id,
    })
    const comment = expectData(
      yield* author.browser.rpc((api) =>
        api.createComment({ petitionId: petition.id, text: "Frist!" }),
      ),
    )
    return { ...campus, author, other, petition, comment }
  })

  const pageComments = (browser: Browser, petitionId: string) =>
    Effect.map(
      browser.rpc((api) => api.getPetitionById({ id: petitionId })),
      (result) => {
        const petition = expectData(result)
        return "comments" in petition ? petition.comments : assert.fail("no comments for a user")
      },
    )

  it.live("the author edits their comment; only they are offered the edit", () =>
    Effect.gen(function* () {
      const { author, other, petition, comment } = yield* commented
      const edited = expectData(
        yield* author.browser.rpc((api) =>
          api.updateComment({ id: comment.id, text: "  First!  " }),
        ),
      )
      assert.include(edited, { id: comment.id, text: "First!", author: "Ada Lovelace" })

      assert.deepStrictEqual(
        (yield* pageComments(author.browser, petition.id)).map((c) => [c.text, c.canEdit]),
        [["First!", true]],
      )
      assert.deepStrictEqual(
        (yield* pageComments(other.browser, petition.id)).map((c) => [c.text, c.canEdit]),
        [["First!", false]],
      )
    }),
  )

  it.live("edits are checked like new comments", () =>
    Effect.gen(function* () {
      const { author, comment } = yield* commented
      for (const [text, message] of [
        ["   ", "must be present"],
        ["x".repeat(5001), "length must be less than or equal to 5000"],
      ] as const) {
        assert.deepStrictEqual(
          expectErrors(
            yield* author.browser.rpc((api) => api.updateComment({ id: comment.id, text })),
          ),
          [{ type: "invalid", field: "text", message }],
        )
      }
    }),
  )

  it.live("a deleted comment disappears but its replies and reports stay", () =>
    Effect.gen(function* () {
      const { app, school, author, other, petition, comment } = yield* commented
      const admin = yield* createUser(app, { organizationId: school.id, role: "admin" })
      const reply = expectData(
        yield* other.browser.rpc((api) =>
          api.createComment({
            petitionId: petition.id,
            text: "Agreed",
            parentCommentId: comment.id,
          }),
        ),
      )
      const report = expectData(
        yield* other.browser.rpc((api) =>
          api.createContentReport({ commentId: comment.id, reason: "spam" }),
        ),
      )

      expectData(yield* author.browser.rpc((api) => api.deleteComment({ id: comment.id })))
      assert.deepStrictEqual(
        (yield* pageComments(author.browser, petition.id)).map((c) => c.id),
        [reply.id],
      )
      assert.deepStrictEqual(
        expectData(
          yield* other.browser.rpc((api) => api.getComments({ petitionId: petition.id })),
        ).map((c) => [c.id, c.parentCommentId]),
        [[reply.id, comment.id]],
      )
      // The text is gone from the row; the report's snapshot keeps what was reported.
      const [row] = yield* app.sql<{ text: string | null }>`
        SELECT text FROM comment WHERE id = ${comment.id}`
      assert.strictEqual(row!.text, null)
      const reports = expectData(yield* admin.browser.rpc((api) => api.getContentReports({})))
      assert.deepInclude(
        reports.map((r) => [r.id, r.commentId, r.targetText]),
        [report.id, comment.id, "Frist!"],
      )
      expectData(
        yield* admin.browser.rpc((api) =>
          api.resolveContentReport({
            id: report.id,
            outcome: "resolved",
            hideContent: true,
            resolutionNote: "Spam",
          }),
        ),
      )

      // A deleted comment can't be changed, deleted again, replied to or reported.
      const gone = [{ type: "not_found", message: "Comment not found" }]
      assert.deepStrictEqual(
        expectErrors(
          yield* author.browser.rpc((api) => api.updateComment({ id: comment.id, text: "Back" })),
        ),
        gone,
      )
      assert.deepStrictEqual(
        expectErrors(yield* author.browser.rpc((api) => api.deleteComment({ id: comment.id }))),
        gone,
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* other.browser.rpc((api) =>
            api.createComment({ petitionId: petition.id, text: "Re", parentCommentId: comment.id }),
          ),
        ),
        [
          {
            type: "invalid",
            field: "parentCommentId",
            message: "Reply to a comment in this petition.",
          },
        ],
      )
      assert.strictEqual(
        expectErrors(
          yield* other.browser.rpc((api) =>
            api.createContentReport({ commentId: comment.id, reason: "spam" }),
          ),
        ).length,
        1,
      )
    }),
  )

  it.live(
    "only the author may change a comment they can still see, outside archived classrooms",
    () =>
      Effect.gen(function* () {
        const { app, newStudent } = yield* makeCampus
        const professor = yield* newStudent()
        const author = yield* newStudent()
        const classroom = yield* insertClassroom(app, { professorId: professor.id })
        yield* upsertMembership(app, { classroomId: classroom.id, userId: author.id })
        const comment = (petitionId: string, text = "Mine") =>
          Effect.map(
            author.browser.rpc((api) => api.createComment({ petitionId, text })),
            expectData,
          )
        const changes = (id: string) =>
          calls(
            (api) => api.updateComment({ id, text: "Edited" }),
            (api) => api.deleteComment({ id }),
          )
        const refused = (browser: Browser, id: string) =>
          Effect.gen(function* () {
            const errors: Array<unknown> = []
            for (const change of changes(id)) errors.push(expectErrors(yield* browser.rpc(change)))
            return errors
          })
        const notFound = [{ type: "not_found", message: "Comment not found" }]

        // Someone else's comment, readable: Forbidden.
        const campusPetition = yield* insertPetition(app, { userId: professor.id })
        const onCampus = yield* comment(campusPetition.id)
        assert.deepStrictEqual(yield* refused(professor.browser, onCampus.id), [
          [{ type: "forbidden", message: "Only the author can change this comment." }],
          [{ type: "forbidden", message: "Only the author can change this comment." }],
        ])
        // Closed petitions don't block edits (as in Ash); only taking part is closed.
        yield* updatePetitionRow(app, campusPetition.id, { status: "closed" })
        expectData(
          yield* author.browser.rpc((api) => api.updateComment({ id: onCampus.id, text: "Later" })),
        )
        // Hidden by a moderator, or on a hidden petition: not found, even for the author.
        const openPetition = yield* insertPetition(app, { userId: professor.id })
        const hidden = yield* comment(openPetition.id)
        yield* app.sql`UPDATE comment SET hidden_at = now() WHERE id = ${hidden.id}`
        assert.deepStrictEqual(yield* refused(author.browser, hidden.id), [notFound, notFound])
        yield* updatePetitionRow(app, campusPetition.id, { hidden_at: new Date() })
        assert.deepStrictEqual(yield* refused(author.browser, onCampus.id), [notFound, notFound])
        assert.deepStrictEqual(yield* refused(author.browser, crypto.randomUUID()), [
          notFound,
          notFound,
        ])
        const malformed = [{ type: "invalid", field: "id", message: "is invalid" }]
        assert.deepStrictEqual(yield* refused(author.browser, "nope"), [malformed, malformed])

        // Classroom comments: the author must still be in the classroom, and it must be open.
        const classroomPetition = yield* insertPetition(app, {
          userId: professor.id,
          classroomId: classroom.id,
        })
        const inClassroom = yield* comment(classroomPetition.id)
        yield* setClassroomArchived(app, classroom.id, true)
        const archived = [
          { type: "invalid", message: "This classroom is archived or unavailable." },
        ]
        assert.deepStrictEqual(yield* refused(author.browser, inClassroom.id), [archived, archived])
        const page = expectData(
          yield* author.browser.rpc((api) => api.getPetitionById({ id: classroomPetition.id })),
        )
        assert.deepStrictEqual("comments" in page ? page.comments.map((c) => c.canEdit) : [], [
          false,
        ])
        yield* setClassroomArchived(app, classroom.id, false)
        yield* upsertMembership(app, {
          classroomId: classroom.id,
          userId: author.id,
          status: "removed",
        })
        assert.deepStrictEqual(yield* refused(author.browser, inClassroom.id), [notFound, notFound])
      }),
  )
})

describe("updates", () => {
  it.live("only the author or the classroom's professor publishes updates", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const professor = yield* newStudent()
      const classroom = yield* insertClassroom(app, { professorId: professor.id })
      yield* upsertMembership(app, { classroomId: classroom.id, userId: owner.id })
      yield* upsertMembership(app, { classroomId: classroom.id, userId: signer.id })
      const petition = yield* insertPetition(app, { userId: owner.id, classroomId: classroom.id })
      const publish =
        (title: string, body = "Progress") =>
        (api: ApiClient) =>
          api.createUpdate({ petitionId: petition.id, title, body })

      assert.deepStrictEqual(expectErrors(yield* signer.browser.rpc(publish("News"))), [
        {
          type: "invalid",
          field: "petitionId",
          message: "Only the petition owner or classroom professor can publish updates.",
        },
      ])
      assert.deepStrictEqual(expectErrors(yield* owner.browser.rpc(publish(" ", ""))), [
        { type: "invalid", field: "title", message: "is required" },
        { type: "invalid", field: "body", message: "is required" },
      ])
      const first = expectData(yield* owner.browser.rpc(publish("  First  ")))
      assert.include(first, { petitionId: petition.id, title: "First", body: "Progress" })
      // Updates don't need an open petition.
      yield* updatePetitionRow(app, petition.id, { status: "closed" })
      expectData(yield* professor.browser.rpc(publish("Second")))

      const forPetition = (api: ApiClient) => api.getUpdatesForPetition({ petitionId: petition.id })
      assert.deepStrictEqual(
        expectData(yield* signer.browser.rpc(forPetition)).map((u) => u.title),
        ["Second", "First"],
      )
      assert.deepStrictEqual(
        expectData(yield* signer.browser.rpc((api) => api.getUpdates({}))).map((u) => u.title),
        ["First", "Second"],
      )
    }),
  )
})

describe("activity visibility", () => {
  it.live("private classroom activity is hidden from outsiders until they join", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const professor = yield* newStudent()
      const outsider = yield* newStudent()
      const classroom = yield* insertClassroom(app, { professorId: professor.id })
      const petition = yield* insertPetition(app, {
        userId: professor.id,
        classroomId: classroom.id,
      })
      const petitionId = petition.id
      expectData(yield* professor.browser.rpc((api) => api.createSignature({ petitionId })))
      expectData(
        yield* professor.browser.rpc((api) => api.createComment({ petitionId, text: "Private" })),
      )
      expectData(
        yield* professor.browser.rpc((api) =>
          api.createUpdate({ petitionId, title: "News", body: "Private" }),
        ),
      )
      const reads = (browser: typeof outsider.browser) =>
        Effect.gen(function* () {
          const lengths: Array<number> = []
          for (const read of listCalls(
            (api) => api.getSignatures({}),
            (api) => api.getComments({}),
            (api) => api.getUpdates({}),
            (api) => api.getUpdatesForPetition({ petitionId }),
          )) {
            lengths.push(expectData(yield* browser.rpc(read)).length)
          }
          return lengths
        })

      assert.deepStrictEqual(yield* reads(outsider.browser), [0, 0, 0, 0])
      yield* upsertMembership(app, { classroomId: classroom.id, userId: outsider.id })
      assert.deepStrictEqual(yield* reads(outsider.browser), [1, 1, 1, 1])
      yield* upsertMembership(app, {
        classroomId: classroom.id,
        userId: outsider.id,
        status: "removed",
      })
      assert.deepStrictEqual(yield* reads(outsider.browser), [0, 0, 0, 0])
    }),
  )

  it.live("hiding a petition hides its activity and blocks new activity", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })
      const petitionId = petition.id
      expectData(yield* signer.browser.rpc((api) => api.createSignature({ petitionId })))
      expectData(yield* signer.browser.rpc((api) => api.createComment({ petitionId, text: "Hi" })))
      expectData(
        yield* owner.browser.rpc((api) =>
          api.createUpdate({ petitionId, title: "News", body: "Progress" }),
        ),
      )
      yield* updatePetitionRow(app, petitionId, { hidden_at: new Date() })

      for (const read of calls(
        (api) => api.getSignatures({ petitionId }),
        (api) => api.getComments({ petitionId }),
        (api) => api.getUpdates({ petitionId }),
        (api) => api.getUpdatesForPetition({ petitionId }),
      )) {
        assert.deepStrictEqual(expectData(yield* owner.browser.rpc(read)), [])
      }
      const unavailable = [
        { type: "invalid", field: "petitionId", message: "This petition is unavailable." },
      ]
      assert.deepStrictEqual(
        expectErrors(
          yield* owner.browser.rpc((api) =>
            api.createUpdate({ petitionId, title: "News", body: "More" }),
          ),
        ),
        unavailable,
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* signer.browser.rpc((api) => api.createComment({ petitionId, text: "More" })),
        ),
        unavailable,
      )
    }),
  )

  it.live("guests can't load signatures, comments or updates", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })
      const guest = yield* makeBrowser(app)
      const petitionId = petition.id
      for (const read of calls(
        (api) => api.getSignatures({}),
        (api) => api.getComments({}),
        (api) => api.getUpdates({}),
        (api) => api.getUpdatesForPetition({ petitionId }),
      )) {
        assert.deepStrictEqual(expectErrors(yield* guest.rpc(read)), [
          { type: "unauthenticated", message: "Sign in to access petition activity." },
        ])
      }
      for (const write of calls(
        (api) => api.createComment({ petitionId, text: "Hi" }),
        (api) => api.createUpdate({ petitionId, title: "News", body: "Progress" }),
      )) {
        assert.deepStrictEqual(expectErrors(yield* guest.rpc(write)), [
          { type: "unauthenticated", message: "Sign in to participate." },
        ])
      }
    }),
  )
})

describe("concurrency", () => {
  it.live("concurrent signing by one student leaves exactly one signature", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })

      const results = yield* Effect.all(
        Array.from({ length: 8 }, () =>
          signer.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
        ),
        { concurrency: "unbounded" },
      )
      assert.strictEqual(results.filter((result) => result.success).length, 1)
      for (const result of results.filter((result) => !result.success)) {
        assert.deepStrictEqual(expectErrors(result), [
          { type: "invalid", field: "petitionId", message: "has already been taken" },
        ])
      }
      assert.strictEqual(yield* count(app, "signature"), 1)
    }),
  )

  it.live("a signature waiting on a petition that is being closed is rejected", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })

      // Hold the petition's row lock, as closing does, while the signature arrives.
      const signing = yield* Effect.gen(function* () {
        yield* app.sql`SELECT id FROM petition WHERE id = ${petition.id} FOR UPDATE`
        const signing = yield* Effect.forkChild(
          signer.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
        )
        yield* waitForLockWaiter(app)
        yield* app.sql`UPDATE petition SET status = 'closed' WHERE id = ${petition.id}`
        return signing
      }).pipe(app.sql.withTransaction, Effect.orDie)

      assert.deepStrictEqual(expectErrors(yield* Fiber.join(signing)), [
        { type: "invalid", field: "petitionId", message: "This petition is closed." },
      ])
      assert.strictEqual(yield* count(app, "signature"), 0)
    }),
  )

  it.live("closing waits for a signature in progress, which then counts", () =>
    Effect.gen(function* () {
      const { app, newStudent } = yield* makeCampus
      const owner = yield* newStudent()
      const signer = yield* newStudent()
      const petition = yield* insertPetition(app, { userId: owner.id })

      const [signed, closed] = yield* Effect.all(
        [
          signer.browser.rpc((api) => api.createSignature({ petitionId: petition.id })),
          owner.browser.rpc((api) => api.closePetition({ id: petition.id })),
        ],
        { concurrency: "unbounded" },
      )
      const signatures = yield* count(app, "signature")
      assert.strictEqual(expectData(closed).status, "closed")
      if (signed.success) {
        assert.strictEqual(signatures, 1)
        assert.strictEqual(expectData(closed).signaturesCount, 1)
      } else {
        assert.deepStrictEqual(signed.errors, [
          { type: "invalid", field: "petitionId", message: "This petition is closed." },
        ])
        assert.strictEqual(signatures, 0)
      }
    }),
  )
})

/** Waits until some query in the test database is blocked on a row lock. */
const waitForLockWaiter = (app: TestApp) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [row] = yield* app.sql<{ waiting: number }>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`
      if (row!.waiting > 0) return
      yield* Effect.sleep("20 millis")
    }
    return yield* Effect.die("no query waited on the lock")
  })
