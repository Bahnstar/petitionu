import { assert, describe, it } from "@effect/vitest"
import type { ApiClient, RpcResult } from "@petitionu/domain"
import { Effect } from "effect"
import { insertClassroom, ok } from "./support/classrooms.ts"
import { makeTestApp } from "./support/harness.ts"
import { insertPetition } from "./support/petitions.ts"
import { createOrganization, createUser } from "./support/users.ts"

const cap = 250

/** One more row than the cap of everything a capped list returns. */
const makeWorld = Effect.gen(function* () {
  const app = yield* makeTestApp()
  const school = yield* createOrganization(app, { domain: "school.edu" })
  const user = yield* createUser(app, { organizationId: school.id, role: "superadmin" })
  const petition = yield* insertPetition(app, {
    userId: user.id,
    organizationId: school.id,
    classroomId: null,
  })
  const classroom = yield* insertClassroom(app, { professorId: user.id, organizationId: school.id })
  const rows = cap + 1
  const series = app.sql`generate_series(1, ${rows}::int) AS n`
  const inserts = [
    app.sql`INSERT INTO category (name) SELECT 'Category ' || n FROM ${series}`,
    app.sql`INSERT INTO organization (name, domain)
      SELECT 'Campus ' || n, 'campus' || n || '.edu' FROM ${series}`,
    app.sql`INSERT INTO preference (name, value, user_id)
      SELECT 'p' || n, 'v', ${user.id} FROM ${series}`,
    app.sql`INSERT INTO notification (title, status, user_id)
      SELECT 'n' || n, 'unread', ${user.id} FROM ${series}`,
    app.sql`INSERT INTO classrooms (name, join_code, professor_id, organization_id)
      SELECT 'Classroom ' || n, gen_random_uuid(), ${user.id}, ${school.id} FROM ${series}`,
    app.sql`INSERT INTO comment (petition_id, user_id, text)
      SELECT ${petition.id}, ${user.id}, 'c' || n FROM ${series}`,
    app.sql`INSERT INTO update (petition_id, title, body)
      SELECT ${petition.id}, 'u' || n, 'b' FROM ${series}`,
    app.sql`INSERT INTO support_requests (requester_email, kind, message, user_id)
      SELECT ${user.email}, 'support', 'm' || n, ${user.id} FROM ${series}`,
    app.sql`INSERT INTO petition (title, description, user_id, organization_id)
      SELECT 'Petition ' || n, 'd', ${user.id}, ${school.id} FROM ${series}`,
    app.sql`INSERT INTO users (email, confirmed_at, email_verified, organization_id)
      SELECT 'member' || n || '@school.edu', now(), true, ${school.id} FROM ${series}`,
  ]
  for (const insert of inserts) yield* insert.pipe(Effect.orDie)
  yield* app.sql`
    INSERT INTO classroom_memberships (classroom_id, user_id, status)
    SELECT ${classroom.id}, id, 'pending' FROM users WHERE email LIKE 'member%'
  `.pipe(Effect.orDie)
  yield* app.sql`
    INSERT INTO signature (petition_id, user_id)
    SELECT ${petition.id}, id FROM users WHERE email LIKE 'member%'
  `.pipe(Effect.orDie)
  return { user, petition, classroom }
})

describe("list limits", () => {
  it.live("lists the UI doesn't need whole stop at the cap", () =>
    Effect.gen(function* () {
      const { user, petition, classroom } = yield* makeWorld
      const count = <A>(call: (api: ApiClient) => Promise<RpcResult<ReadonlyArray<A>>>) =>
        user.browser.rpc(call).pipe(
          Effect.flatMap(ok),
          Effect.map((rows) => rows.length),
        )

      const petitionId = petition.id
      const classroomId = classroom.id
      const lengths = {
        getCategories: yield* count((api) => api.getCategories()),
        getOrganizations: yield* count((api) => api.getOrganizations()),
        getUsers: yield* count((api) => api.getUsers()),
        getPreferences: yield* count((api) => api.getPreferences()),
        getNotifications: yield* count((api) => api.getNotifications()),
        getClassrooms: yield* count((api) => api.getClassrooms()),
        getClassroomMemberships: yield* count((api) => api.getClassroomMemberships()),
        getPendingMemberships: yield* count((api) => api.getPendingMemberships({ classroomId })),
        getSignatures: yield* count((api) => api.getSignatures({ petitionId })),
        getComments: yield* count((api) => api.getComments({ petitionId })),
        getUpdates: yield* count((api) => api.getUpdates({ petitionId })),
        getUpdatesForPetition: yield* count((api) => api.getUpdatesForPetition({ petitionId })),
        getPublicPetitions: yield* count((api) => api.getPublicPetitions()),
        getMySupportRequests: yield* count((api) => api.getMySupportRequests()),
      }
      for (const [procedure, length] of Object.entries(lengths)) {
        assert.strictEqual(length, cap, procedure)
      }
    }),
  )

  it.live("getMyClassrooms caps a request with no limit and says what it held back", () =>
    Effect.gen(function* () {
      const { user } = yield* makeWorld
      const page = yield* user.browser
        .rpc((api) => api.getMyClassrooms({}))
        .pipe(Effect.flatMap(ok))
      assert.lengthOf(page.results, cap)
      assert.deepStrictEqual(
        { count: page.count, limit: page.limit, hasMore: page.hasMore },
        { count: cap + 2, limit: cap, hasMore: true },
      )
    }),
  )

  it.live("lists the UI shows whole stay complete", () =>
    Effect.gen(function* () {
      const { user, classroom } = yield* makeWorld
      const classroomId = classroom.id
      const petitions = yield* user.browser
        .rpc((api) => api.getPetitions({}))
        .pipe(Effect.flatMap(ok))
      const roster = yield* user.browser
        .rpc((api) => api.getMembershipsForClassroom({ classroomId }))
        .pipe(Effect.flatMap(ok))
      assert.lengthOf(petitions, cap + 2)
      assert.lengthOf(roster, cap + 1)
    }),
  )
})
