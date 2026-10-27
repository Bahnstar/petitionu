import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeTestApp } from "./support/harness.ts"
import { insertCategory } from "./support/petitions.ts"
import { createUser } from "./support/users.ts"

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
})
