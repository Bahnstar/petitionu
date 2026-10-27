import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  createClassroom,
  createProfessor,
  createStudent,
  failure,
  ok,
  seedMembership,
} from "./support/classrooms.ts"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { createUser } from "./support/users.ts"

describe("classrooms", () => {
  it.live("a professor creates a classroom on their campus and reads it back", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const professor = yield* createProfessor(app)
      const created = yield* createClassroom(professor, {
        name: "  Civics  ",
        description: "Local government",
      })
      assert.strictEqual(created.name, "Civics")
      assert.strictEqual(created.description, "Local government")
      assert.isFalse(created.archived)
      assert.isTrue(created.allowStudentPetitions)
      assert.strictEqual(created.professorId, professor.id)
      assert.match(created.joinCode, /^[0-9a-f-]{36}$/)

      const [user] = yield* app.sql<{ organization_id: string }>`
        SELECT organization_id FROM users WHERE id = ${professor.id}
      `.pipe(Effect.orDie)
      assert.strictEqual(created.organizationId, user!.organization_id)

      const read = yield* ok(
        yield* professor.browser.rpc((api) => api.getClassroomById({ id: created.id })),
      )
      assert.deepInclude(read, {
        id: created.id,
        name: "Civics",
        memberCount: 0,
        petitionCount: 0,
        professor: { id: professor.id, firstName: "Pat", lastName: "Professor" },
      })
    }),
  )

  it.live("an outsider can't read a classroom", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const professor = yield* createProfessor(app)
      const classroom = yield* createClassroom(professor)
      const student = yield* createStudent(app)
      const errors = yield* failure(
        yield* student.browser.rpc((api) => api.getClassroomById({ id: classroom.id })),
      )
      assert.deepStrictEqual(errors, [{ type: "not_found", message: "Classroom not found" }])
    }),
  )

  it.live("creation needs a professor or admin with a complete profile", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const create = (user: { browser: typeof professor.browser }) =>
        user.browser.rpc((api) => api.createClassroom({ name: "Incomplete" }))
      const professor = yield* createProfessor(app)

      const student = yield* createStudent(app)
      assert.strictEqual((yield* failure(yield* create(student)))[0]!.type, "forbidden")
      const superadmin = yield* createUser(app, { role: "superadmin" })
      assert.strictEqual((yield* failure(yield* create(superadmin)))[0]!.type, "forbidden")
      const admin = yield* createUser(app, {
        role: "admin",
        email: `admin@campus-${crypto.randomUUID().slice(0, 8)}.edu`,
      })
      yield* ok(yield* create(admin))

      const unconfirmed = yield* createProfessor(app, { stage: "unconfirmed" })
      assert.deepStrictEqual(yield* failure(yield* create(unconfirmed)), [
        { type: "invalid", message: "Confirm your email before participating." },
      ])
      const confirmed = yield* createProfessor(app, { stage: "confirmed" })
      assert.deepStrictEqual(yield* failure(yield* create(confirmed)), [
        { type: "invalid", message: "Complete your campus profile before participating." },
      ])
      yield* app.sql`UPDATE users SET first_name = '  ' WHERE id = ${professor.id}`.pipe(
        Effect.orDie,
      )
      assert.deepStrictEqual(yield* failure(yield* create(professor)), [
        { type: "invalid", message: "Complete your campus profile before participating." },
      ])

      const guest = yield* makeBrowser(app)
      assert.strictEqual(
        (yield* failure(yield* create({ browser: guest })))[0]!.type,
        "unauthenticated",
      )
    }),
  )

  it.live("names and descriptions are validated", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const professor = yield* createProfessor(app)
      const create = (name: string, description?: string) =>
        professor.browser.rpc((api) =>
          api.createClassroom(description === undefined ? { name } : { name, description }),
        )
      assert.deepStrictEqual(yield* failure(yield* create("   ")), [
        { type: "invalid", field: "name", message: "is required" },
      ])
      assert.deepStrictEqual(yield* failure(yield* create("x".repeat(256))), [
        { type: "invalid", field: "name", message: "length must be less than or equal to 255" },
      ])
      assert.deepStrictEqual(yield* failure(yield* create("Civics", "x".repeat(2001))), [
        {
          type: "invalid",
          field: "description",
          message: "length must be less than or equal to 2000",
        },
      ])
      const blank = yield* ok(yield* create("Civics", "  "))
      assert.isNull(blank.description)
    }),
  )

  it.live("only the professor edits, archives, unarchives and regenerates the join code", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const professor = yield* createProfessor(app)
      const classroom = yield* createClassroom(professor)
      const member = yield* createStudent(app)
      yield* seedMembership(app, classroom.id, member.id, "active")
      const ta = yield* createStudent(app)
      yield* seedMembership(app, classroom.id, ta.id, "active", "ta")
      const outsider = yield* createStudent(app)
      const id = classroom.id

      for (const user of [member, ta, outsider]) {
        const expected = user === outsider ? "not_found" : "forbidden"
        for (const result of [
          yield* user.browser.rpc((api) => api.updateClassroom({ id, name: "Mine" })),
          yield* user.browser.rpc((api) => api.archiveClassroom({ id })),
          yield* user.browser.rpc((api) => api.unarchiveClassroom({ id })),
          yield* user.browser.rpc((api) => api.regenerateJoinCode({ id })),
        ]) {
          assert.strictEqual((yield* failure(result))[0]!.type, expected)
        }
      }

      const updated = yield* ok(
        yield* professor.browser.rpc((api) =>
          api.updateClassroom({
            id,
            name: "Civics II",
            description: "Second term",
            allowStudentPetitions: false,
          }),
        ),
      )
      assert.deepInclude(updated, {
        name: "Civics II",
        description: "Second term",
        allowStudentPetitions: false,
        joinCode: classroom.joinCode,
      })
      assert.deepStrictEqual(
        yield* failure(
          yield* professor.browser.rpc((api) => api.updateClassroom({ id, name: "" })),
        ),
        [{ type: "invalid", field: "name", message: "is required" }],
      )

      const archived = yield* ok(
        yield* professor.browser.rpc((api) => api.archiveClassroom({ id })),
      )
      assert.isTrue(archived.archived)
      const unarchived = yield* ok(
        yield* professor.browser.rpc((api) => api.unarchiveClassroom({ id })),
      )
      assert.isFalse(unarchived.archived)

      const regenerated = yield* ok(
        yield* professor.browser.rpc((api) => api.regenerateJoinCode({ id })),
      )
      assert.notStrictEqual(regenerated.joinCode, classroom.joinCode)
      const late = yield* createStudent(app)
      const oldCode = yield* failure(
        yield* late.browser.rpc((api) => api.joinClassroomByCode({ joinCode: classroom.joinCode })),
      )
      assert.strictEqual(oldCode[0]!.field, "joinCode")
      yield* ok(
        yield* late.browser.rpc((api) =>
          api.joinClassroomByCode({ joinCode: regenerated.joinCode }),
        ),
      )
    }),
  )

  it.live("members see the classrooms they belong to; the member count is active members", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const professor = yield* createProfessor(app)
      const classroom = yield* createClassroom(professor)
      const member = yield* createStudent(app)
      yield* seedMembership(app, classroom.id, member.id, "active")
      const pending = yield* createStudent(app)
      yield* seedMembership(app, classroom.id, pending.id, "pending")

      const listed = yield* ok(yield* member.browser.rpc((api) => api.getClassrooms()))
      assert.deepStrictEqual(
        listed.map((c) => [c.id, c.memberCount]),
        [[classroom.id, 1]],
      )
      assert.deepStrictEqual(
        yield* ok(yield* pending.browser.rpc((api) => api.getClassrooms())),
        [],
      )
      const pendingRead = yield* failure(
        yield* pending.browser.rpc((api) => api.getClassroomById({ id: classroom.id })),
      )
      assert.strictEqual(pendingRead[0]!.type, "not_found")
      const mine = yield* ok(yield* member.browser.rpc((api) => api.getMyClassrooms({})))
      assert.strictEqual(mine.count, 1)
    }),
  )

  it.live("pagination filters archived classrooms before limiting", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const professor = yield* createProfessor(app)
      const first = yield* createClassroom(professor, { name: "Class 00" })
      for (let index = 1; index <= 13; index++) {
        yield* createClassroom(professor, { name: `Class ${String(index).padStart(2, "0")}` })
      }
      yield* ok(yield* professor.browser.rpc((api) => api.archiveClassroom({ id: first.id })))

      const page = (offset: number) =>
        Effect.flatMap(
          professor.browser.rpc((api) =>
            api.getMyClassrooms({ archived: false, limit: 12, offset }),
          ),
          ok,
        )
      const one = yield* page(0)
      const two = yield* page(12)
      assert.strictEqual(one.results.length, 12)
      assert.strictEqual(one.count, 13)
      assert.isTrue(one.hasMore)
      assert.strictEqual(two.results.length, 1)
      assert.isFalse(two.hasMore)
      assert.isFalse(one.results.some((c) => c.archived))
      assert.strictEqual(one.results[0]!.name, "Class 01")
      assert.notInclude(
        one.results.map((c) => c.id),
        two.results[0]!.id,
      )

      const all = yield* ok(yield* professor.browser.rpc((api) => api.getMyClassrooms({})))
      assert.strictEqual(all.results.length, 14)
      assert.strictEqual(all.count, 14)
    }),
  )
})
