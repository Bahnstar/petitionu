import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  createClassroom,
  createProfessor,
  createStudent,
  failure,
  ok,
} from "./support/classrooms.ts"
import { makeTestApp } from "./support/harness.ts"

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
})
