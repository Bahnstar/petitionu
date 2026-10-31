import { assert, describe, it } from "@effect/vitest"
import type { ApiClient } from "@petitionu/domain"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { insertClassroom, setClassroomArchived, upsertMembership } from "./support/classrooms.ts"
import {
  insertCategory,
  insertPetition,
  insertSignature,
  updatePetitionRow,
} from "./support/petitions.ts"
import { createOrganization, createUser } from "./support/users.ts"

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
      const input = {
        title: "Valid title",
        description: "Valid description",
        categoryId: category.id,
      }

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
      const [{ count }] = (yield* app.sql<{
        count: number
      }>`SELECT count(*)::int AS count FROM petition`) as [{ count: number }]
      assert.strictEqual(count, 0)
    }),
  )

  it.live("invalid petition values are rejected with per-field messages", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const author = yield* createUser(app)
      const category = yield* insertCategory(app)
      const input = {
        title: "Valid title",
        description: "Valid description",
        categoryId: category.id,
      }
      const past = new Date(Date.now() - 60_000).toISOString()

      for (const [change, expected] of [
        [{ title: "   " }, { field: "title", message: "must be present" }],
        [{ description: "" }, { field: "description", message: "must be present" }],
        [
          { title: "x".repeat(201) },
          { field: "title", message: "length must be less than or equal to 200" },
        ],
        [{ goal: 0 }, { field: "goal", message: "must be more than or equal to 1" }],
        [{ goal: null }, { field: "goal", message: "must be present" }],
        [{ deadline: past }, { field: "deadline", message: "Choose a deadline in the future." }],
        [{ deadline: "not a date" }, { field: "deadline", message: "is invalid" }],
        [{ categoryId: crypto.randomUUID() }, { field: "categoryId", message: "is invalid" }],
        [{ categoryId: "not-a-uuid" }, { field: "categoryId", message: "is invalid" }],
      ] as const) {
        const errors = expectErrors(
          // `goal: null` is outside the payload's type, for a caller that gets past it.
          yield* author.browser.rpc((api) => api.createPetition({ ...input, ...change } as never)),
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
      })
      // Deadlines are stored and sent to the second.
      const wholeSeconds = `${deadline.toISOString().slice(0, 19)}Z`
      assert.deepStrictEqual(created.deadline, new Date(wholeSeconds))
      const sent = yield* author.browser.rawRpc("getPetitionById", { id: created.id })
      assert.strictEqual(sent.value.deadline, wholeSeconds)
      assert.match(sent.value.insertedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/)
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

  it.live(
    "guests cannot list petitions, and shared links skip hidden and classroom petitions",
    () =>
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

        assert.deepStrictEqual(
          expectErrors(yield* guest.rpc((api) => api.getPetitions({}))),
          signInFirst,
        )
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
        for (const id of [classPetition.id, crypto.randomUUID()]) {
          assert.deepStrictEqual(
            expectErrors(yield* guest.rpc((api) => api.getPetitionById({ id }))),
            notFound,
          )
        }
        // A malformed id is rejected as a payload, before the call.
        assert.deepStrictEqual(
          expectErrors(yield* guest.rpc((api) => api.getPetitionById({ id: "not-a-uuid" }))),
          [{ type: "invalid", field: "id", message: "is invalid" }],
        )
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

  it.live("counts and capabilities depend on the caller, and names show to signed-in users", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app)
      const owner = yield* createUser(app, {
        firstName: "Private",
        lastName: "Owner",
        organizationId: school.id,
      })
      const signer = yield* createUser(app, { organizationId: school.id })
      const petition = yield* insertPetition(app, { userId: owner.id })
      yield* insertSignature(app, { petitionId: petition.id, userId: signer.id, reason: "Study" })
      yield* app.sql`
        INSERT INTO comment (petition_id, user_id, text) VALUES (${petition.id}, ${owner.id}, 'Thank you')`
      yield* app.sql`
        INSERT INTO comment (petition_id, user_id, text, hidden_at)
        VALUES (${petition.id}, ${signer.id}, 'Removed', now())`
      yield* app.sql`
        INSERT INTO update (petition_id, title, body) VALUES (${petition.id}, 'News', 'Progress')`

      for (const [user, canManage, hasSigned] of [
        [owner, true, false],
        [signer, false, true],
      ] as const) {
        const detail = expectData(
          yield* user.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
        )
        assert.include(detail, {
          signaturesCount: 1,
          canManage,
          hasSigned,
          author: "Private Owner",
        })
        assert.ok("comments" in detail)
        assert.deepStrictEqual(
          detail.comments.map(({ text, author }) => ({ text, author })),
          [{ text: "Thank you", author: "Private Owner" }],
        )
        assert.deepStrictEqual(
          detail.signatures.map(({ reason }) => reason),
          ["Study"],
        )
        assert.deepStrictEqual(
          detail.updates.map(({ title, body }) => ({ title, body })),
          [{ title: "News", body: "Progress" }],
        )
        assert.notInclude(JSON.stringify(detail.signatures), signer.id)
      }

      const [listed] = expectData(yield* signer.browser.rpc((api) => api.getPetitions({})))
      assert.include(listed, { id: petition.id, author: "Private Owner", hasSigned: true })

      yield* updatePetitionRow(app, petition.id, { is_anonymous: true })
      for (const user of [owner, signer]) {
        const detail = expectData(
          yield* user.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
        )
        assert.strictEqual(detail.author, "Anonymous student")
      }
    }),
  )

  it.live("petitions trend with more than 5 signatures and at least half the goal", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app)
      const petition = yield* insertPetition(app, { userId: owner.id, goal: 12 })
      const signers = yield* Effect.forEach(Array.from({ length: 6 }), () =>
        Effect.map(createUser(app, { stage: "unconfirmed" }), (user) => user.id),
      )
      const trending = () =>
        Effect.map(
          owner.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
          (result) => expectData(result).trending,
        )
      for (const userId of signers.slice(0, 5)) {
        yield* insertSignature(app, { petitionId: petition.id, userId })
      }
      assert.strictEqual(yield* trending(), false)
      yield* insertSignature(app, { petitionId: petition.id, userId: signers[5]! })
      assert.strictEqual(yield* trending(), true)
      yield* updatePetitionRow(app, petition.id, { goal: 13 })
      assert.strictEqual(yield* trending(), false)
    }),
  )

  it.live("only the author edits, closes and marks a victory; hidden petitions are gone", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app)
      const owner = yield* createUser(app, { organizationId: school.id })
      const other = yield* createUser(app, { organizationId: school.id })
      const category = yield* insertCategory(app)
      const petition = expectData(
        yield* owner.browser.rpc((api) =>
          api.createPetition({
            title: "New petition",
            description: "Better",
            categoryId: category.id,
          }),
        ),
      )
      const forbidden = [{ type: "forbidden", message: "You can't manage this petition." }]

      assert.deepStrictEqual(
        expectErrors(yield* other.browser.rpc((api) => api.closePetition({ id: petition.id }))),
        forbidden,
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* other.browser.rpc((api) => api.updatePetition({ id: petition.id, title: "Mine" })),
        ),
        forbidden,
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* owner.browser.rpc((api) =>
            api.updatePetition({
              id: petition.id,
              deadline: new Date(Date.now() - 1000).toISOString(),
            }),
          ),
        ),
        [{ type: "invalid", field: "deadline", message: "Choose a deadline in the future." }],
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* owner.browser.rpc((api) => api.updatePetition({ id: petition.id, title: " " })),
        ),
        [{ type: "invalid", field: "title", message: "must be present" }],
      )

      const edited = expectData(
        yield* owner.browser.rpc((api) =>
          api.updatePetition({ id: petition.id, title: "Edited", goal: 50, isAnonymous: true }),
        ),
      )
      assert.include(edited, {
        title: "Edited",
        description: "Better",
        goal: 50,
        isAnonymous: true,
        status: "open",
      })
      const closed = expectData(
        yield* owner.browser.rpc((api) => api.closePetition({ id: petition.id })),
      )
      assert.strictEqual(closed.status, "closed")
      const victory = expectData(
        yield* owner.browser.rpc((api) => api.markPetitionVictory({ id: petition.id })),
      )
      assert.strictEqual(victory.status, "victory")

      yield* updatePetitionRow(app, petition.id, { hidden_at: new Date() })
      const notFound = [{ type: "not_found", message: "Petition not found" }]
      for (const call of [
        (api: ApiClient) => api.updatePetition({ id: petition.id, title: "Back" }),
        (api: ApiClient) => api.closePetition({ id: petition.id }),
        (api: ApiClient) => api.markPetitionVictory({ id: petition.id }),
      ]) {
        assert.deepStrictEqual(expectErrors(yield* owner.browser.rpc(call)), notFound)
      }
      assert.deepStrictEqual(
        expectData(yield* owner.browser.rpc((api) => api.getPetitions({}))),
        [],
      )
      assert.deepStrictEqual(
        expectData(yield* owner.browser.rpc((api) => api.getPublicPetitions())),
        [],
      )
    }),
  )

  it.live("an owner edits a petition past its deadline without changing the deadline", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app)
      const petition = yield* insertPetition(app, { userId: owner.id })
      const stored = "2026-01-02T03:04:05Z"
      yield* updatePetitionRow(app, petition.id, { deadline: new Date(stored) })
      const edit = (deadline: string) =>
        owner.browser.rpc((api) =>
          api.updatePetition({ id: petition.id, title: "Edited", deadline }),
        )

      // Deadlines are stored to the second, so anything in that second is the same deadline.
      for (const unchanged of [stored, "2026-01-02T03:04:05.000Z", "2026-01-02T03:04:05.999Z"]) {
        const edited = expectData(yield* edit(unchanged))
        assert.strictEqual(edited.title, "Edited")
        assert.deepStrictEqual(edited.deadline, new Date(stored))
      }

      for (const changed of ["2026-01-02T03:04:04.999Z", "2026-01-02T03:04:06Z"]) {
        assert.deepStrictEqual(expectErrors(yield* edit(changed)), [
          { type: "invalid", field: "deadline", message: "Choose a deadline in the future." },
        ])
      }
      const later = new Date(Date.now() + 86_400_000)
      later.setUTCMilliseconds(0)
      const moved = expectData(yield* edit(later.toISOString()))
      assert.deepStrictEqual(moved.deadline, later)
    }),
  )

  it.live("a goal fails with one message, the same on create and update", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app)
      const category = yield* insertCategory(app)
      const petition = yield* insertPetition(app, { userId: owner.id, goal: 7 })
      const input = { title: "A title", description: "Better", categoryId: category.id }

      for (const [goal, message] of [
        [0, "must be more than or equal to 1"],
        [-1, "must be more than or equal to 1"],
        [0.5, "is invalid"],
        [-1.5, "is invalid"],
        [Number.NaN, "is invalid"],
        [Number.POSITIVE_INFINITY, "is invalid"],
        [2 ** 53, "is invalid"],
        [null, "must be present"],
      ] as const) {
        const expected = [{ type: "invalid", field: "goal", message }]
        // `null` is outside the payload's type, for a caller that gets past it.
        const created = yield* owner.browser.rpc((api) =>
          api.createPetition({ ...input, goal } as never),
        )
        assert.deepStrictEqual(expectErrors(created), expected, String(goal))
        const updated = yield* owner.browser.rpc((api) =>
          api.updatePetition({ id: petition.id, goal } as never),
        )
        assert.deepStrictEqual(expectErrors(updated), expected, String(goal))
      }
      const [row] = yield* app.sql<{ goal: string }>`
        SELECT goal::text FROM petition WHERE id = ${petition.id}`
      assert.strictEqual(row!.goal, "7")
    }),
  )

  it.live("allowComments and isAnonymous are booleans; null never reaches the column", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app)
      const category = yield* insertCategory(app)
      const petition = yield* insertPetition(app, { userId: owner.id, isAnonymous: true })
      yield* updatePetitionRow(app, petition.id, { allow_comments: false })
      const nulls = { allowComments: null, isAnonymous: null } as object
      const rejected = [
        { type: "invalid", field: "allowComments", message: "is invalid" },
        { type: "invalid", field: "isAnonymous", message: "is invalid" },
      ]

      assert.deepStrictEqual(
        expectErrors(
          yield* owner.browser.rpc((api) =>
            api.createPetition({
              title: "A title",
              description: "Better",
              categoryId: category.id,
              ...nulls,
            }),
          ),
        ),
        rejected,
      )
      assert.deepStrictEqual(
        expectErrors(
          yield* owner.browser.rpc((api) => api.updatePetition({ id: petition.id, ...nulls })),
        ),
        rejected,
      )

      // Without the shared client, `null` is `undefined` on the wire: an omitted field.
      const sent = yield* owner.browser.rawRpc("updatePetition", {
        id: petition.id,
        allowComments: null,
        isAnonymous: null,
      })
      assert.strictEqual(sent._tag, "Success")
      const [row] = yield* app.sql<{
        allow_comments: boolean | null
        is_anonymous: boolean | null
      }>`
        SELECT allow_comments, is_anonymous FROM petition WHERE id = ${petition.id}`
      assert.deepStrictEqual({ ...row }, { allow_comments: false, is_anonymous: true })
    }),
  )

  it.live("a deadline that isn't a date fails on update too", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app)
      const petition = yield* insertPetition(app, { userId: owner.id })

      for (const deadline of ["", "not a date", "2026-13-45"]) {
        assert.deepStrictEqual(
          expectErrors(
            yield* owner.browser.rpc((api) => api.updatePetition({ id: petition.id, deadline })),
          ),
          [{ type: "invalid", field: "deadline", message: "is invalid" }],
          deadline,
        )
      }
    }),
  )

  it.live("a petition's first deadline must be in the future, like any other change", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const owner = yield* createUser(app)
      const petition = yield* insertPetition(app, { userId: owner.id })

      const cleared = expectData(
        yield* owner.browser.rpc((api) =>
          api.updatePetition({ id: petition.id, title: "Edited", deadline: null }),
        ),
      )
      assert.strictEqual(cleared.deadline, null)
      assert.deepStrictEqual(
        expectErrors(
          yield* owner.browser.rpc((api) =>
            api.updatePetition({ id: petition.id, deadline: "2026-01-02T03:04:05Z" }),
          ),
        ),
        [{ type: "invalid", field: "deadline", message: "Choose a deadline in the future." }],
      )
    }),
  )

  it.live("classroom petitions need active membership and take the classroom's campus", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app)
      const classSchool = yield* createOrganization(app, { name: "Class U", domain: "class.edu" })
      const professor = yield* createUser(app, { role: "professor", organizationId: school.id })
      const student = yield* createUser(app, { organizationId: school.id })
      const category = yield* insertCategory(app)
      const classroom = yield* insertClassroom(app, {
        professorId: professor.id,
        organizationId: classSchool.id,
      })
      const input = {
        title: "Class idea",
        description: "Better classes",
        categoryId: category.id,
        classroomId: classroom.id,
      }
      const unavailable = [
        { type: "invalid", field: "classroomId", message: "This classroom is unavailable." },
      ]

      assert.deepStrictEqual(
        expectErrors(yield* student.browser.rpc((api) => api.createClassroomPetition(input))),
        unavailable,
      )
      yield* upsertMembership(app, {
        classroomId: classroom.id,
        userId: student.id,
        status: "pending",
      })
      assert.deepStrictEqual(
        expectErrors(yield* student.browser.rpc((api) => api.createClassroomPetition(input))),
        unavailable,
      )
      yield* upsertMembership(app, { classroomId: classroom.id, userId: student.id })
      const petition = expectData(
        yield* student.browser.rpc((api) => api.createClassroomPetition(input)),
      )
      assert.include(petition, { classroomId: classroom.id, organizationId: classSchool.id })

      // Visible to members and the professor only; never in the campus list for others.
      const outsider = yield* createUser(app, { organizationId: school.id })
      const ids = (
        result:
          | { success: true; data: ReadonlyArray<{ id: string }> }
          | { success: false; errors: unknown },
      ) => expectData(result).map((row) => row.id)
      for (const user of [student, professor]) {
        assert.deepStrictEqual(
          ids(
            yield* user.browser.rpc((api) =>
              api.getClassroomPetitions({ classroomId: classroom.id }),
            ),
          ),
          [petition.id],
        )
        assert.deepStrictEqual(ids(yield* user.browser.rpc((api) => api.getPetitions({}))), [
          petition.id,
        ])
        assert.deepStrictEqual(ids(yield* user.browser.rpc((api) => api.getPublicPetitions())), [])
      }
      assert.deepStrictEqual(
        ids(
          yield* outsider.browser.rpc((api) =>
            api.getClassroomPetitions({ classroomId: classroom.id }),
          ),
        ),
        [],
      )
      assert.deepStrictEqual(ids(yield* outsider.browser.rpc((api) => api.getPetitions({}))), [])
      assert.deepStrictEqual(
        expectErrors(
          yield* outsider.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
        ),
        [{ type: "not_found", message: "Petition not found" }],
      )

      // The professor manages students' classroom petitions.
      const asProfessor = expectData(
        yield* professor.browser.rpc((api) => api.getPetitionById({ id: petition.id })),
      )
      assert.strictEqual(asProfessor.canManage, true)

      // A removed member loses access, even to their own petition.
      yield* upsertMembership(app, {
        classroomId: classroom.id,
        userId: student.id,
        status: "removed",
      })
      assert.deepStrictEqual(
        expectErrors(yield* student.browser.rpc((api) => api.closePetition({ id: petition.id }))),
        [{ type: "not_found", message: "Petition not found" }],
      )
      expectData(yield* professor.browser.rpc((api) => api.closePetition({ id: petition.id })))

      yield* setClassroomArchived(app, classroom.id, true)
      assert.deepStrictEqual(
        expectErrors(yield* professor.browser.rpc((api) => api.createClassroomPetition(input))),
        unavailable,
      )
    }),
  )

  it.live("a classroom can keep petitions to its professor", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app)
      const professor = yield* createUser(app, { role: "professor", organizationId: school.id })
      const student = yield* createUser(app, { organizationId: school.id })
      const category = yield* insertCategory(app)
      const classroom = yield* insertClassroom(app, {
        professorId: professor.id,
        allowStudentPetitions: false,
      })
      yield* upsertMembership(app, { classroomId: classroom.id, userId: student.id, role: "ta" })
      const input = {
        title: "Class idea",
        description: "Better classes",
        categoryId: category.id,
        classroomId: classroom.id,
      }
      assert.deepStrictEqual(
        expectErrors(yield* student.browser.rpc((api) => api.createClassroomPetition(input))),
        [
          {
            type: "invalid",
            field: "classroomId",
            message: "Only the professor can create petitions in this classroom.",
          },
        ],
      )
      const petition = expectData(
        yield* professor.browser.rpc((api) => api.createClassroomPetition(input)),
      )
      // Without a campus on the classroom, the petition takes the professor's.
      assert.strictEqual(petition.organizationId, school.id)
    }),
  )

  it.live("lists are newest first, by campus, and classroom lists can sort by goal", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const school = yield* createOrganization(app)
      const other = yield* createOrganization(app, { name: "Other", domain: "other.edu" })
      const user = yield* createUser(app, { role: "professor", organizationId: school.id })
      const classroom = yield* insertClassroom(app, { professorId: user.id })
      const first = yield* insertPetition(app, { userId: user.id, organizationId: school.id })
      const second = yield* insertPetition(app, { userId: user.id, organizationId: other.id })
      const small = yield* insertPetition(app, {
        userId: user.id,
        classroomId: classroom.id,
        goal: 5,
      })
      const large = yield* insertPetition(app, {
        userId: user.id,
        classroomId: classroom.id,
        goal: 50,
      })
      const ids = (
        result:
          | { success: true; data: ReadonlyArray<{ id: string }> }
          | { success: false; errors: unknown },
      ) => expectData(result).map((row) => row.id)

      assert.deepStrictEqual(ids(yield* user.browser.rpc((api) => api.getPetitions({}))), [
        large.id,
        small.id,
        second.id,
        first.id,
      ])
      assert.deepStrictEqual(
        ids(yield* user.browser.rpc((api) => api.getPetitions({ organizationId: school.id }))),
        [first.id],
      )
      assert.deepStrictEqual(ids(yield* user.browser.rpc((api) => api.getPublicPetitions())), [
        second.id,
        first.id,
      ])
      assert.deepStrictEqual(
        ids(
          yield* user.browser.rpc((api) =>
            api.getClassroomPetitions({ classroomId: classroom.id, sort: "goal" }),
          ),
        ),
        [large.id, small.id],
      )
    }),
  )
})
