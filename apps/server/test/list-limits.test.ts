import { assert, describe, it } from "@effect/vitest"
import type { ApiClient, RpcResult } from "@petitionu/domain"
import { Effect } from "effect"
import { insertClassroom, ok } from "./support/classrooms.ts"
import { makeTestApp } from "./support/harness.ts"
import { insertPetition } from "./support/petitions.ts"
import { createOrganization, createUser } from "./support/users.ts"

const cap = 250

/** The labels of `count` rows of a series, from row `start`, going `step` rows at a time. */
const labels = (label: (row: number) => string, count: number, start = 1, step = 1) =>
  Array.from({ length: count }, (_, index) => label(start + index * step))

const padded = (row: number) => `AAA ${String(row).padStart(3, "0")}`
const oldest = (label: (row: number) => string) => labels(label, cap)
const newest = (label: (row: number) => string) => labels(label, cap, cap + 1, -1)

/**
 * One more row than the cap of everything a capped list returns. Each row of a series is a minute
 * after the one before, all long before the rows of the setup above them, and carries its number,
 * so a test can tell exactly which rows a list returned, in what order.
 */
const makeWorld = Effect.gen(function* () {
  const app = yield* makeTestApp()
  const school = yield* createOrganization(app, { domain: "school.edu" })
  const user = yield* createUser(app, { organizationId: school.id, role: "superadmin" })
  const petition = yield* insertPetition(app, {
    userId: user.id,
    organizationId: school.id,
    classroomId: null,
    title: "Setup petition",
  })
  const classroom = yield* insertClassroom(app, { professorId: user.id, organizationId: school.id })
  const rows = cap + 1
  const series = app.sql`generate_series(1, ${rows}::int) AS n`
  const at = app.sql`timestamp '2020-01-01' + n * interval '1 minute'`
  const name = app.sql`'AAA ' || lpad(n::text, 3, '0')`
  const inserts = [
    app.sql`INSERT INTO category (name) SELECT 'Category ' || n FROM ${series}`,
    app.sql`INSERT INTO organization (name, domain)
      SELECT ${name}, 'campus' || n || '.edu' FROM ${series}`,
    app.sql`INSERT INTO preference (name, value, user_id, inserted_at)
      SELECT 'p' || n, 'v', ${user.id}, ${at} FROM ${series}`,
    app.sql`INSERT INTO notification (title, status, user_id, inserted_at)
      SELECT 'n' || n, 'unread', ${user.id}, ${at} FROM ${series}`,
    app.sql`INSERT INTO classrooms (name, join_code, professor_id, organization_id)
      SELECT ${name}, gen_random_uuid(), ${user.id}, ${school.id} FROM ${series}`,
    app.sql`INSERT INTO comment (petition_id, user_id, text, inserted_at)
      SELECT ${petition.id}, ${user.id}, 'c' || n, ${at} FROM ${series}`,
    app.sql`INSERT INTO update (petition_id, title, body, inserted_at)
      SELECT ${petition.id}, 'u' || n, 'b', ${at} FROM ${series}`,
    app.sql`INSERT INTO content_reports (target_title, target_text, reason, petition_id,
        reporter_id)
      SELECT 't', 't', 'other', ${petition.id}, ${user.id} FROM ${series}`,
    app.sql`INSERT INTO support_requests (requester_email, kind, message, user_id)
      SELECT ${user.email}, 'support', 'm' || n, ${user.id} FROM ${series}`,
    app.sql`INSERT INTO petition (title, description, user_id, organization_id, inserted_at)
      SELECT 'Petition ' || n, 'd', ${user.id}, ${school.id}, ${at} FROM ${series}`,
    app.sql`INSERT INTO petition (title, description, user_id, organization_id, classroom_id)
      SELECT 'Class petition ' || n, 'd', ${user.id}, ${school.id}, ${classroom.id}
      FROM ${series}`,
    app.sql`INSERT INTO users (email, confirmed_at, email_verified, organization_id, inserted_at)
      SELECT 'member' || n || '@school.edu', now(), true, ${school.id}, ${at} FROM ${series}`,
  ]
  for (const insert of inserts) yield* insert.pipe(Effect.orDie)
  yield* app.sql`
    INSERT INTO classroom_memberships (classroom_id, user_id, status, inserted_at)
    SELECT ${classroom.id}, id, 'pending', inserted_at FROM users WHERE email LIKE 'member%'
  `.pipe(Effect.orDie)
  yield* app.sql`
    INSERT INTO signature (petition_id, user_id, reason, inserted_at)
    SELECT ${petition.id}, id, email::text, inserted_at FROM users WHERE email LIKE 'member%'
  `.pipe(Effect.orDie)
  const members = yield* app.sql<{ id: string; email: string }>`
    SELECT id, email::text AS email FROM users WHERE email LIKE 'member%'
  `.pipe(Effect.orDie)
  const memberIds = new Map(members.map(({ id, email }) => [id, email]))
  return { user, petition, classroom, memberIds }
})

const member = (row: number) => `member${row}@school.edu`

describe("list limits", () => {
  it.live("lists the web app doesn't call return the rows their order puts first", () =>
    Effect.gen(function* () {
      const { user, petition, classroom, memberIds } = yield* makeWorld
      const expectRows = <A>(
        call: (api: ApiClient) => Promise<RpcResult<ReadonlyArray<A>>>,
        label: (row: A) => string | null | undefined,
        expected: ReadonlyArray<string>,
      ) =>
        user.browser.rpc(call).pipe(
          Effect.flatMap(ok),
          Effect.map((found) => assert.deepStrictEqual(found.map(label), [...expected])),
        )

      const petitionId = petition.id
      const classroomId = classroom.id
      const email = ({ id }: { readonly id: string }) => memberIds.get(id)
      const membershipEmail = ({ userId }: { readonly userId: string }) => email({ id: userId })

      yield* expectRows(
        (api) => api.getOrganizations(),
        (row) => row.name,
        oldest(padded),
      )
      yield* expectRows(
        (api) => api.getClassrooms(),
        (row) => row.name,
        oldest(padded),
      )
      yield* expectRows((api) => api.getUsers({}), email, oldest(member))
      yield* expectRows(
        (api) => api.getPreferences(),
        (row) => row.name,
        oldest((row) => `p${row}`),
      )
      yield* expectRows(
        (api) => api.getNotifications(),
        (row) => row.title,
        newest((row) => `n${row}`),
      )
      yield* expectRows((api) => api.getClassroomMemberships(), membershipEmail, oldest(member))
      yield* expectRows(
        (api) => api.getPendingMemberships({ classroomId }),
        membershipEmail,
        oldest(member),
      )
      yield* expectRows(
        (api) => api.getSignatures({ petitionId }),
        (row) => row.reason,
        oldest(member),
      )
      yield* expectRows(
        (api) => api.getComments({ petitionId }),
        (row) => row.text,
        oldest((row) => `c${row}`),
      )
      yield* expectRows(
        (api) => api.getUpdates({ petitionId }),
        (row) => row.title,
        oldest((row) => `u${row}`),
      )
      yield* expectRows(
        (api) => api.getUpdatesForPetition({ petitionId }),
        (row) => row.title,
        newest((row) => `u${row}`),
      )
      // Newest first, so the setup's petition comes before the series.
      yield* expectRows(
        (api) => api.getPublicPetitions(),
        (row) => row.title,
        ["Setup petition", ...labels((row) => `Petition ${row}`, cap - 1, cap + 1, -1)],
      )
    }),
  )

  it.live("lists the web app treats as complete stay complete", () =>
    Effect.gen(function* () {
      const { user, classroom } = yield* makeWorld
      const classroomId = classroom.id
      const count = <A>(call: (api: ApiClient) => Promise<RpcResult<ReadonlyArray<A>>>) =>
        user.browser.rpc(call).pipe(
          Effect.flatMap(ok),
          Effect.map((rows) => rows.length),
        )

      const lengths = {
        getPetitions: yield* count((api) => api.getPetitions({})),
        getCategories: yield* count((api) => api.getCategories()),
        getClassroomPetitions: yield* count((api) => api.getClassroomPetitions({ classroomId })),
        getMembershipsForClassroom: yield* count((api) =>
          api.getMembershipsForClassroom({ classroomId }),
        ),
        getContentReports: yield* count((api) => api.getContentReports({})),
        getSupportRequests: yield* count((api) => api.getSupportRequests({})),
        getMySupportRequests: yield* count((api) => api.getMySupportRequests()),
      }
      for (const [procedure, length] of Object.entries(lengths)) {
        assert.isAbove(length, cap, procedure)
      }
    }),
  )

  it.live("getMyClassrooms is complete unless the caller asks for a page, which is capped", () =>
    Effect.gen(function* () {
      const { user } = yield* makeWorld
      const page = (input: { readonly limit?: number }) =>
        user.browser
          .rpc((api) => api.getMyClassrooms(input))
          .pipe(
            Effect.flatMap(ok),
            Effect.map(({ results, count, limit, hasMore }) => ({
              rows: results.length,
              count,
              limit,
              hasMore,
            })),
          )

      assert.deepStrictEqual(yield* page({}), {
        rows: cap + 2,
        count: cap + 2,
        limit: null,
        hasMore: false,
      })
      assert.deepStrictEqual(yield* page({ limit: cap * 2 }), {
        rows: cap,
        count: cap + 2,
        limit: cap,
        hasMore: true,
      })
    }),
  )
})
