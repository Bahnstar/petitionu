import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp, type TestApp } from "./support/harness.ts"
import { createOrganization, createUser, uniqueEmail } from "./support/users.ts"

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
            category: {
              id: data.petitions[0]!.category!.id,
              name: "Campus life",
              color: "#123456",
            },
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
      const superadmin = yield* createUser(app, {
        organizationId: elsewhere.id,
        role: "superadmin",
      })
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

describe("setUserRole", () => {
  it.live("campus admins change roles only for non-superadmins on their own campus", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const campus = yield* createOrganization(app)
      const elsewhere = yield* createOrganization(app, { domain: "elsewhere.edu" })
      const admin = yield* createUser(app, { organizationId: campus.id, role: "admin" })
      const target = yield* createUser(app, { organizationId: campus.id })
      const campusSuperadmin = yield* createUser(app, {
        organizationId: campus.id,
        role: "superadmin",
      })
      const otherCampus = yield* createUser(app, { organizationId: elsewhere.id })
      // Confirming at a campus's domain joins it, so this user signs up at an unknown domain.
      const unassigned = yield* createUser(app, {
        stage: "confirmed",
        email: uniqueEmail("unassigned.example"),
      })

      const promoted = yield* admin.browser.rpc((api) =>
        api.setUserRole({ id: target.id, role: "professor" }),
      )
      if (!promoted.success) return assert.fail(JSON.stringify(promoted))
      assert.deepInclude(promoted.data, { id: target.id, role: "professor" })
      const reread = yield* target.browser.rpc((api) => api.getUserById({ id: target.id }))
      assert.deepInclude(reread, { success: true })
      if (reread.success) assert.deepInclude(reread.data, { role: "professor" })

      const forbidden = yield* admin.browser.rpc((api) =>
        api.setUserRole({ id: campusSuperadmin.id, role: "student" }),
      )
      assert.deepInclude(forbidden, { success: false })
      if (!forbidden.success) assert.strictEqual(forbidden.errors[0]!.type, "forbidden")
      for (const hidden of [otherCampus, unassigned]) {
        const result = yield* admin.browser.rpc((api) =>
          api.setUserRole({ id: hidden.id, role: "student" }),
        )
        assert.deepInclude(result, { success: false })
        if (!result.success) assert.strictEqual(result.errors[0]!.type, "not_found")
      }

      const grantSuperadmin = yield* admin.browser.rpc((api) =>
        api.setUserRole({ id: target.id, role: "superadmin" }),
      )
      assert.deepStrictEqual(grantSuperadmin, {
        success: false,
        errors: [{ type: "invalid", message: "only a superadmin can assign the superadmin role" }],
      })
    }),
  )

  it.live("superadmins change anyone; students and guests change nobody", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const campus = yield* createOrganization(app)
      const superadmin = yield* createUser(app, { stage: "confirmed", role: "superadmin" })
      const student = yield* createUser(app, { organizationId: campus.id })
      const target = yield* createUser(app, { organizationId: campus.id })
      const guest = yield* makeBrowser(app)

      const byStudent = yield* student.browser.rpc((api) =>
        api.setUserRole({ id: target.id, role: "admin" }),
      )
      assert.deepInclude(byStudent, { success: false })
      const selfPromotion = yield* student.browser.rpc((api) =>
        api.setUserRole({ id: student.id, role: "admin" }),
      )
      assert.deepInclude(selfPromotion, { success: false })
      if (!selfPromotion.success) assert.strictEqual(selfPromotion.errors[0]!.type, "forbidden")
      const byGuest = yield* guest.rpc((api) => api.setUserRole({ id: target.id, role: "admin" }))
      assert.deepInclude(byGuest, { success: false })
      if (!byGuest.success) assert.strictEqual(byGuest.errors[0]!.type, "unauthenticated")

      for (const role of ["admin", "superadmin"] as const) {
        const result = yield* superadmin.browser.rpc((api) =>
          api.setUserRole({ id: target.id, role }),
        )
        if (!result.success) return assert.fail(JSON.stringify(result))
        assert.strictEqual(result.data.role, role)
      }
    }),
  )
})

describe("preferences and notifications", () => {
  it.live("callers read only their own", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const campus = yield* createOrganization(app)
      const owner = yield* createUser(app, { organizationId: campus.id })
      const other = yield* createUser(app, { organizationId: campus.id })
      const guest = yield* makeBrowser(app)
      yield* app.sql`
        INSERT INTO preference (name, value, user_id)
        VALUES ('digest', 'weekly', ${owner.id}), ('digest', 'never', ${other.id})
      `.pipe(Effect.orDie)
      yield* app.sql`
        INSERT INTO notification (title, body, status, user_id, inserted_at)
        VALUES ('Older', NULL, 'read', ${owner.id}, '2026-01-01 00:00:00'),
          ('Newer', 'Your petition won', 'unread', ${owner.id}, '2026-02-01 00:00:00'),
          ('Not yours', NULL, 'unread', ${other.id}, '2026-03-01 00:00:00')
      `.pipe(Effect.orDie)

      const preferences = yield* owner.browser.rpc((api) => api.getPreferences())
      if (!preferences.success) return assert.fail(JSON.stringify(preferences))
      assert.deepStrictEqual(
        preferences.data.map(({ name, value }) => ({ name, value })),
        [{ name: "digest", value: "weekly" }],
      )
      const notifications = yield* owner.browser.rpc((api) => api.getNotifications())
      if (!notifications.success) return assert.fail(JSON.stringify(notifications))
      assert.deepStrictEqual(
        notifications.data.map(({ title, body, status, insertedAt }) => ({
          title,
          body,
          status,
          insertedAt,
        })),
        [
          {
            title: "Newer",
            body: "Your petition won",
            status: "unread",
            insertedAt: "2026-02-01T00:00:00.000000Z",
          },
          { title: "Older", body: null, status: "read", insertedAt: "2026-01-01T00:00:00.000000Z" },
        ],
      )

      for (const call of [
        guest.rpc((api) => api.getPreferences()),
        guest.rpc((api) => api.getNotifications()),
      ]) {
        const result = yield* call
        assert.deepInclude(result, { success: false })
        if (!result.success) assert.strictEqual(result.errors[0]!.type, "unauthenticated")
      }
    }),
  )
})
