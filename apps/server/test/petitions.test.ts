import { assert, describe, it } from "@effect/vitest"
import type { ApiClient } from "@petitionu/domain"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { insertClassroom } from "./support/classrooms.ts"
import {
  insertCategory,
  insertPetition,
  insertSignature,
  updatePetitionRow,
} from "./support/petitions.ts"
import { createUser } from "./support/users.ts"

const expectErrors = (
  result: { success: true; data: unknown } | { success: false; errors: ReadonlyArray<unknown> },
) => {
  if (result.success) assert.fail(`expected failure, got ${JSON.stringify(result.data)}`)
  return result.errors
}

const expectData = <A>(result: { success: true; data: A } | { success: false; errors: unknown }) => {
  if (!result.success) assert.fail(`expected success, got ${JSON.stringify(result.errors)}`)
  return result.data
}

describe("petitions", () => {
  it.live("a complete student creates a campus petition and reads it back", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const author = yield* createUser(app, { firstName: "Ada", lastName: "Lovelace" })
      const category = yield* insertCategory(app, { name: "Library" })

      const created = expectData(
        yield* author.browser.rpc((api) =>
          api.createPetition({
            title: "  Longer library hours  ",
            description: "More time to study",
            categoryId: category.id,
          }),
        ),
      )
      assert.strictEqual(created.title, "Longer library hours")
      assert.strictEqual(created.goal, 1000)
      assert.strictEqual(created.status, "open")

      const [me] = yield* app.sql<{ organization_id: string }>`
        SELECT organization_id FROM users WHERE id = ${author.id}`
      const read = expectData(
        yield* author.browser.rpc((api) => api.getPetitionById({ id: created.id })),
      )
      assert.include(read, {
        id: created.id,
        author: "Ada Lovelace",
        canManage: true,
        hasSigned: false,
        signaturesCount: 0,
        daysLeft: 30,
        trending: false,
        organizationId: me!.organization_id,
        classroomId: null,
        allowComments: true,
        isAnonymous: false,
        deadline: null,
        categoryId: category.id,
      })
      assert.deepStrictEqual(read.category, { id: category.id, name: "Library", color: "#00683d" })
    }),
  )

  it.live("only confirmed users with a complete profile may create petitions", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const category = yield* insertCategory(app)
      const input = { title: "Valid title", description: "Valid description", categoryId: category.id }

      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(expectErrors(yield* guest.rpc((api) => api.createPetition(input))), [
        { type: "unauthenticated", message: "Sign in to participate." },
      ])
      const unconfirmed = yield* createUser(app, { stage: "unconfirmed" })
      assert.deepStrictEqual(
        expectErrors(yield* unconfirmed.browser.rpc((api) => api.createPetition(input))),
        [{ type: "invalid", message: "Confirm your email before participating." }],
      )
      const confirmed = yield* createUser(app, { stage: "confirmed" })
      assert.deepStrictEqual(
        expectErrors(yield* confirmed.browser.rpc((api) => api.createPetition(input))),
        [{ type: "invalid", message: "Complete your campus profile before participating." }],
      )
      const blankName = yield* createUser(app, { firstName: "  " })
      assert.deepStrictEqual(
        expectErrors(yield* blankName.browser.rpc((api) => api.createPetition(input))),
        [{ type: "invalid", message: "Complete your campus profile before participating." }],
      )
      const [{ count }] = (yield* app.sql<{ count: number }>`SELECT count(*)::int AS count FROM petition`) as [{ count: number }]
      assert.strictEqual(count, 0)
    }),
  )

  it.live("invalid petition values are rejected with per-field messages", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const author = yield* createUser(app)
      const category = yield* insertCategory(app)
      const input = { title: "Valid title", description: "Valid description", categoryId: category.id }
      const past = new Date(Date.now() - 60_000).toISOString()

      for (const [change, expected] of [
        [{ title: "   " }, { field: "title", message: "must be present" }],
        [{ description: "" }, { field: "description", message: "must be present" }],
        [{ title: "x".repeat(201) }, { field: "title", message: "length must be less than or equal to 200" }],
        [{ goal: 0 }, { field: "goal", message: "must be more than or equal to 1" }],
        [{ goal: null }, { field: "goal", message: "must be present" }],
        [{ deadline: past }, { field: "deadline", message: "Choose a deadline in the future." }],
        [{ deadline: "not a date" }, { field: "deadline", message: "is invalid" }],
        [{ categoryId: crypto.randomUUID() }, { field: "categoryId", message: "is invalid" }],
      ] as const) {
        const errors = expectErrors(
          yield* author.browser.rpc((api) => api.createPetition({ ...input, ...change })),
        )
        assert.deepStrictEqual(errors, [{ type: "invalid", ...expected }], JSON.stringify(change))
      }

      const deadline = new Date(Date.now() + 3 * 86_400_000 + 3_600_000)
      const created = expectData(
        yield* author.browser.rpc((api) =>
          api.createPetition({
            ...input,
            goal: 10,
            deadline: deadline.toISOString(),
            allowComments: false,
            isAnonymous: true,
            // Not an input: the status of a new petition is always open.
            status: "victory",
          } as never),
        ),
      )
      assert.include(created, {
        status: "open",
        goal: 10,
        daysLeft: 3,
        allowComments: false,
        isAnonymous: true,
        author: "Anonymous student",
        deadline: `${deadline.toISOString().slice(0, 19)}Z`,
      })
    }),
  )

  it.live("a guest's shared link shows only the shared fields, without private names", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app, { firstName: "Private", lastName: "Owner" })
      const category = yield* insertCategory(app, { name: "Housing" })
      const petition = yield* insertPetition(app, {
        userId: owner.id,
        categoryId: category.id,
        isAnonymous: true,
      })
      yield* insertSignature(app, {
        petitionId: petition.id,
        userId: owner.id,
        ipAddress: "127.0.0.1",
        userAgent: "Secret browser",
      })

      const guest = yield* makeBrowser(app)
      const result = yield* guest.rpc((api) => api.getPetitionById({ id: petition.id }))
      const shared = expectData(result)
      assert.include(shared, {
        id: petition.id,
        author: "Anonymous student",
        canManage: false,
        hasSigned: false,
        signaturesCount: 1,
      })
      assert.deepStrictEqual(shared.category, { id: category.id, name: "Housing" })
      assert.deepStrictEqual(Object.keys(shared).sort(), [
        "allowComments",
        "author",
        "canManage",
        "category",
        "classroomId",
        "daysLeft",
        "deadline",
        "description",
        "goal",
        "hasSigned",
        "id",
        "insertedAt",
        "isAnonymous",
        "organizationId",
        "signaturesCount",
        "status",
        "title",
        "trending",
      ])
      const raw = JSON.stringify(result)
      assert.notInclude(raw, "Private Owner")
      assert.notInclude(raw, "127.0.0.1")
      assert.notInclude(raw, owner.id)
    }),
  )

  it.live("guests cannot list petitions, and shared links skip hidden and classroom petitions", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app)
      const petition = yield* insertPetition(app, { userId: owner.id })
      const classroom = yield* insertClassroom(app, { professorId: owner.id })
      const classPetition = yield* insertPetition(app, {
        userId: owner.id,
        classroomId: classroom.id,
      })
      const guest = yield* makeBrowser(app)
      const signInFirst = [
        { type: "unauthenticated", message: "Sign in to access petition activity." },
      ]

      assert.deepStrictEqual(expectErrors(yield* guest.rpc((api) => api.getPetitions({}))), signInFirst)
      assert.deepStrictEqual(
        expectErrors(yield* guest.rpc((api) => api.getPublicPetitions())),
        signInFirst,
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* guest.rpc((api) => api.getClassroomPetitions({ classroomId: classroom.id })),
        ),
        signInFirst,
      )
      for (const call of [
        (api: ApiClient) => api.updatePetition({ id: petition.id, title: "Mine now" }),
        (api: ApiClient) => api.closePetition({ id: petition.id }),
        (api: ApiClient) => api.markPetitionVictory({ id: petition.id }),
      ]) {
        assert.deepStrictEqual(expectErrors(yield* guest.rpc(call)), signInFirst)
      }

      const notFound = [{ type: "not_found", message: "Petition not found" }]
      for (const id of [classPetition.id, "not-a-uuid", crypto.randomUUID()]) {
        assert.deepStrictEqual(
          expectErrors(yield* guest.rpc((api) => api.getPetitionById({ id }))),
          notFound,
        )
      }
      expectData(yield* guest.rpc((api) => api.getPetitionById({ id: petition.id })))
      yield* updatePetitionRow(app, petition.id, { hidden_at: new Date() })
      assert.deepStrictEqual(
        expectErrors(yield* guest.rpc((api) => api.getPetitionById({ id: petition.id }))),
        notFound,
      )
      assert.deepStrictEqual(
        expectErrors(yield* owner.browser.rpc((api) => api.getPetitionById({ id: petition.id }))),
        notFound,
      )
    }),
  )

  it.live("categories are public", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const library = yield* insertCategory(app, { name: "Library", color: "#123456" })
      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(expectData(yield* guest.rpc((api) => api.getCategories())), [
        { id: library.id, name: "Library", description: null, color: "#123456" },
      ])
    }),
  )
})
