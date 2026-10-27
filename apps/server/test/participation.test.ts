import { assert, describe, it } from "@effect/vitest"
import type { ApiClient } from "@petitionu/domain"
import { Effect } from "effect"
import { makeTestApp } from "./support/harness.ts"
import { makeBrowser } from "./support/browser.ts"
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
      for (const call of [
        (api: ApiClient) => api.createSignature(sign),
        (api: ApiClient) => api.createComment({ ...sign, text: "Hello" }),
      ]) {
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
      for (const petitionId of [inClassroom.id, hidden.id, crypto.randomUUID(), "nope"]) {
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
