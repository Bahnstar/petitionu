import { assert, describe, it } from "@effect/vitest"
import type { ApiClient, RpcResult } from "@petitionu/domain"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { insertClassroom } from "./support/classrooms.ts"
import { makeTestApp } from "./support/harness.ts"
import { insertCategory } from "./support/petitions.ts"
import { createUser } from "./support/users.ts"

const id = "00000000-0000-4000-8000-000000000001"
const nul = "a\u0000b"
const refused = "contains an invalid character"

const petition = { title: "Library", description: "Longer hours", categoryId: id }

/** Every text field a caller writes, with the field its error should name. */
const textFields: ReadonlyArray<
  readonly [string, string, (api: ApiClient) => Promise<RpcResult<unknown>>]
> = [
  ["createPetition", "title", (api) => api.createPetition({ ...petition, title: nul })],
  ["createPetition", "description", (api) => api.createPetition({ ...petition, description: nul })],
  [
    "createClassroomPetition",
    "title",
    (api) => api.createClassroomPetition({ ...petition, classroomId: id, title: nul }),
  ],
  ["updatePetition", "title", (api) => api.updatePetition({ id, title: nul })],
  ["updatePetition", "description", (api) => api.updatePetition({ id, description: nul })],
  ["createSignature", "reason", (api) => api.createSignature({ petitionId: id, reason: nul })],
  ["createComment", "text", (api) => api.createComment({ petitionId: id, text: nul })],
  ["updateComment", "text", (api) => api.updateComment({ id, text: nul })],
  [
    "createUpdate",
    "title",
    (api) => api.createUpdate({ petitionId: id, title: nul, body: "News" }),
  ],
  ["createUpdate", "body", (api) => api.createUpdate({ petitionId: id, title: "News", body: nul })],
  ["createClassroom", "name", (api) => api.createClassroom({ name: nul })],
  [
    "createClassroom",
    "description",
    (api) => api.createClassroom({ name: "Maths", description: nul }),
  ],
  ["updateClassroom", "name", (api) => api.updateClassroom({ id, name: nul })],
  ["updateClassroom", "description", (api) => api.updateClassroom({ id, description: nul })],
  [
    "inviteToClassroom",
    "email",
    (api) => api.inviteToClassroom({ classroomId: id, email: `${nul}@campus.edu` }),
  ],
  [
    "createContentReport",
    "details",
    (api) => api.createContentReport({ petitionId: id, reason: "spam", details: nul }),
  ],
  [
    "resolveContentReport",
    "resolutionNote",
    (api) => api.resolveContentReport({ id, outcome: "resolved", resolutionNote: nul }),
  ],
  [
    "createSupportRequest",
    "message",
    (api) => api.createSupportRequest({ kind: "support", message: nul }),
  ],
  [
    "resolveSupportRequest",
    "resolutionNote",
    (api) => api.resolveSupportRequest({ id, resolutionNote: nul }),
  ],
  [
    "updateMyProfile",
    "firstName",
    (api) => api.updateMyProfile({ firstName: nul, lastName: "Lovelace" }),
  ],
  [
    "updateMyProfile",
    "lastName",
    (api) => api.updateMyProfile({ firstName: "Ada", lastName: nul }),
  ],
]

const fieldError = (field: string, message: string) => ({
  success: false as const,
  errors: [{ type: "invalid" as const, field, message }],
})

describe("payloads", () => {
  it.live("a NUL byte is a field error in every text field", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      for (const [procedure, field, call] of textFields) {
        assert.deepStrictEqual(
          yield* browser.rpc(call),
          fieldError(field, refused),
          `${procedure} ${field}`,
        )
      }
    }),
  )

  it.live("a NUL byte gets one message for a field, even when the text is also too long", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      assert.deepStrictEqual(
        yield* browser.rpc((api) =>
          api.createPetition({ ...petition, title: "\u0000".repeat(201) }),
        ),
        fieldError("title", "length must be less than or equal to 200"),
      )
    }),
  )

  it.live("fields checked by the handler answer a NUL byte as they do any bad value", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app)

      assert.deepStrictEqual(
        yield* user.browser.rpc((api) => api.joinClassroomByCode({ joinCode: nul })),
        fieldError("joinCode", "Invalid or archived join code"),
      )
      for (const target of [{ petitionId: nul }, { commentId: nul }]) {
        assert.deepStrictEqual(
          yield* user.browser.rpc((api) => api.createContentReport({ ...target, reason: "spam" })),
          fieldError("petitionId", "This content is unavailable."),
        )
      }
      // A deadline is parsed, not stored as sent.
      const category = yield* insertCategory(app)
      yield* user.browser.rpc((api) =>
        api.createPetition({ ...petition, categoryId: category.id, deadline: `2099\u0000` }),
      )
      assert.isFalse(
        app.logs.some((line) => line.startsWith("Error")),
        app.logs.join("\n"),
      )
    }),
  )

  it.live("text Postgres can hold still saves, whatever its odd characters", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app)
      const category = yield* insertCategory(app)
      const created = yield* user.browser.rpc((api) =>
        api.createPetition({
          ...petition,
          categoryId: category.id,
          title: "a\u0001b 😀   end",
          description: "lone surrogate \ud800 here",
        }),
      )
      assert.isTrue(created.success, JSON.stringify(created))
      assert.isFalse(
        app.logs.some((line) => line.startsWith("Error")),
        app.logs.join("\n"),
      )
    }),
  )

  it.live("a page outside whole numbers is a field error", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const page = (input: { readonly limit?: number; readonly offset?: number }) =>
        user.browser.rpc((api) => api.getMyClassrooms(input))

      for (const offset of [1e300, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, 1.5]) {
        assert.deepStrictEqual(
          yield* page({ limit: 10, offset }),
          fieldError("offset", "is invalid"),
          String(offset),
        )
      }
      for (const limit of [1e300, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, 1.5]) {
        assert.deepStrictEqual(yield* page({ limit }), fieldError("limit", "is invalid"))
      }
      assert.deepStrictEqual(
        yield* page({ offset: -1 }),
        fieldError("offset", "must be more than or equal to 0"),
      )
      assert.deepStrictEqual(
        yield* page({ limit: 0 }),
        fieldError("limit", "must be more than or equal to 1"),
      )
      assert.deepStrictEqual(
        yield* page({ limit: -1 }),
        fieldError("limit", "must be more than or equal to 1"),
      )
    }),
  )

  it.live("the largest page the schema allows reaches Postgres and comes back empty", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const professor = yield* createUser(app, { role: "professor" })
      yield* insertClassroom(app, { professorId: professor.id })
      const result = yield* professor.browser.rpc((api) =>
        api.getMyClassrooms({
          limit: Number.MAX_SAFE_INTEGER,
          offset: Number.MAX_SAFE_INTEGER,
        }),
      )
      assert.isTrue(result.success, JSON.stringify(result))
      if (result.success) {
        assert.deepStrictEqual(
          { ...result.data, results: [...result.data.results] },
          {
            results: [],
            count: 1,
            limit: 250,
            offset: Number.MAX_SAFE_INTEGER,
            hasMore: false,
          },
        )
      }
    }),
  )
})
