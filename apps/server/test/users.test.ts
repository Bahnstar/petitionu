import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp, type TestApp } from "./support/harness.ts"
import { createOrganization, createUser } from "./support/users.ts"

/** Seeds a petition by `userId`, as the petition procedures would have created it. */
const seedPetition = (
  app: TestApp,
  userId: string,
  fields: { readonly title?: string; readonly isAnonymous?: boolean; readonly goal?: number } = {},
) =>
  Effect.gen(function* () {
    const [category] = yield* app.sql<{ id: string }>`
      INSERT INTO category (name, color) VALUES ('Campus life', '#123456') RETURNING id
    `
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO petition (title, description, user_id, is_anonymous, goal, category_id)
      VALUES (${fields.title ?? "Longer library hours"}, 'Open later', ${userId},
        ${fields.isAnonymous ?? false}, ${fields.goal ?? 10}, ${category!.id})
      RETURNING id
    `
    return row!.id
  }).pipe(Effect.orDie)

const seedSignature = (app: TestApp, petitionId: string, userId: string) =>
  Effect.gen(function* () {
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO signature (petition_id, user_id) VALUES (${petitionId}, ${userId}) RETURNING id
    `
    return row!.id
  }).pipe(Effect.orDie)

describe("getUserById", () => {
  it.live("owners see their own dashboard activity", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const campus = yield* createOrganization(app)
      const owner = yield* createUser(app, {
        organizationId: campus.id,
        firstName: "Ada",
        lastName: "Lovelace",
      })
      const fan = yield* createUser(app, { organizationId: campus.id })
      const petition = yield* seedPetition(app, owner.id, { isAnonymous: true })
      const signature = yield* seedSignature(app, petition, owner.id)
      yield* seedSignature(app, petition, fan.id)

      const result = yield* owner.browser.rpc((api) =>
        api.getUserById({ id: owner.id, includeStats: true }),
      )
      if (!result.success) return assert.fail(JSON.stringify(result))
      const data = result.data
      assert.strictEqual(data.id, owner.id)
      assert.strictEqual(data.firstName, "Ada")
      assert.strictEqual(data.lastName, "Lovelace")
      assert.isTrue("email" in data && data.email === owner.email)
      if (!("numPetitions" in data)) return assert.fail("stats missing")
      assert.strictEqual(data.numPetitions, 1)
      assert.strictEqual(data.numSigned, 1)
      assert.strictEqual(data.numPetitionSignees, 1)
      assert.strictEqual(data.totalPetitionSignatures, 2)
      assert.deepStrictEqual(
        data.petitions.map((p) => ({
          id: p.id,
          author: p.author,
          signaturesCount: p.signaturesCount,
          category: p.category,
        })),
        [
          {
            id: petition,
            author: "Anonymous student",
            signaturesCount: 2,
            category: { id: data.petitions[0]!.category!.id, name: "Campus life", color: "#123456" },
          },
        ],
      )
      assert.deepStrictEqual(
        data.signatures.map((s) => ({ id: s.id, petitionId: s.petition.id })),
        [{ id: signature, petitionId: petition }],
      )
    }),
  )

  it.live("operators see a user's details but never their activity", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const campus = yield* createOrganization(app)
      const owner = yield* createUser(app, { organizationId: campus.id })
      const petition = yield* seedPetition(app, owner.id, { isAnonymous: true })
      const signature = yield* seedSignature(app, petition, owner.id)

      for (const role of ["admin", "superadmin"] as const) {
        const operator = yield* createUser(app, { organizationId: campus.id, role })
        const result = yield* operator.browser.rpc((api) =>
          api.getUserById({ id: owner.id, includeStats: true }),
        )
        if (!result.success) return assert.fail(JSON.stringify(result))
        const encoded = JSON.stringify(result)
        assert.notInclude(encoded, petition)
        assert.notInclude(encoded, signature)
        assert.notProperty(result.data, "numPetitions")
        assert.deepInclude(result.data, { id: owner.id, email: owner.email, role: "student" })
      }
    }),
  )

  it.live("other users, guests and other campuses' admins can't find a user", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const campus = yield* createOrganization(app)
      const elsewhere = yield* createOrganization(app, { domain: "elsewhere.edu" })
      const owner = yield* createUser(app, { organizationId: campus.id })
      const classmate = yield* createUser(app, { organizationId: campus.id, role: "professor" })
      const otherAdmin = yield* createUser(app, { organizationId: elsewhere.id, role: "admin" })
      const guest = yield* makeBrowser(app)

      for (const browser of [classmate.browser, otherAdmin.browser, guest]) {
        const result = yield* browser.rpc((api) =>
          api.getUserById({ id: owner.id, includeStats: true }),
        )
        assert.deepStrictEqual(result, {
          success: false,
          errors: [{ type: "not_found", message: "User not found" }],
        })
      }
      const malformed = yield* owner.browser.rpc((api) => api.getUserById({ id: "not-a-uuid" }))
      assert.isFalse(malformed.success)
    }),
  )
})

describe("getUsers", () => {
  it.live("lists only the users the caller may see, with details", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const campus = yield* createOrganization(app)
      const elsewhere = yield* createOrganization(app, { domain: "elsewhere.edu" })
      const student = yield* createUser(app, { organizationId: campus.id })
      const admin = yield* createUser(app, { organizationId: campus.id, role: "admin" })
      const outsider = yield* createUser(app, { organizationId: elsewhere.id })
      const superadmin = yield* createUser(app, { organizationId: elsewhere.id, role: "superadmin" })
      const guest = yield* makeBrowser(app)

      const idsSeenBy = (browser: typeof guest) =>
        Effect.gen(function* () {
          const result = yield* browser.rpc((api) => api.getUsers())
          if (!result.success) return assert.fail(JSON.stringify(result))
          return result.data.map((user) => user.id).toSorted()
        })

      assert.deepStrictEqual(yield* idsSeenBy(guest), [])
      assert.deepStrictEqual(yield* idsSeenBy(student.browser), [student.id])
      assert.deepStrictEqual(yield* idsSeenBy(admin.browser), [student.id, admin.id].toSorted())
      assert.deepStrictEqual(
        yield* idsSeenBy(superadmin.browser),
        [student.id, admin.id, outsider.id, superadmin.id].toSorted(),
      )
      const own = yield* student.browser.rpc((api) => api.getUsers())
      if (!own.success) return assert.fail(JSON.stringify(own))
      assert.deepInclude(own.data[0], { email: student.email, role: "student" })
      assert.notProperty(own.data[0], "numPetitions")
    }),
  )
})
