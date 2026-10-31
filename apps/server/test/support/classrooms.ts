import type { RpcResult } from "@petitionu/domain"
import { Effect } from "effect"
import type { TestApp } from "./harness.ts"
import { createUser, type TestUser, uniqueEmail, type UserStage } from "./users.ts"

/** The data of a successful result; fails the test with the errors otherwise. */
export const ok = <A>(result: RpcResult<A>): Effect.Effect<A> =>
  result.success
    ? Effect.succeed(result.data)
    : Effect.die(new Error(`expected success: ${JSON.stringify(result.errors)}`))

/** The error types and messages of a failed result; fails the test on success. */
export const failure = <A>(result: RpcResult<A>) =>
  result.success
    ? Effect.die(new Error(`expected failure: ${JSON.stringify(result.data)}`))
    : Effect.succeed(result.errors)

interface MemberOptions {
  readonly organizationId?: string
  readonly stage?: UserStage
}

/**
 * A signed-in user on a campus of their own (a new verified organization for a unique
 * domain) unless `organizationId` is given. Complete profile unless `stage` says otherwise.
 */
const createMember =
  (app: TestApp, role: "student" | "professor" | "admin", names: object) =>
  (options: MemberOptions = {}) =>
    createUser(app, {
      role,
      email: uniqueEmail(`campus-${crypto.randomUUID().slice(0, 8)}.edu`),
      ...names,
      ...options,
    })

/** A signed-in professor named Pat Professor. */
export const createProfessor = (app: TestApp, options?: MemberOptions) =>
  createMember(app, "professor", { firstName: "Pat", lastName: "Professor" })(options)

/** A signed-in student named Test Member. */
export const createStudent = (app: TestApp, options?: MemberOptions) =>
  createMember(app, "student", { firstName: "Test", lastName: "Member" })(options)

/** Creates a classroom through `createClassroom`, as `professor`, who gets its join code. */
export const createClassroom = (
  professor: TestUser,
  input: { readonly name?: string; readonly description?: string } = {},
) =>
  Effect.gen(function* () {
    const classroom = yield* ok(
      yield* professor.browser.rpc((api) =>
        api.createClassroom({ name: input.name ?? "Civics", ...input }),
      ),
    )
    const { joinCode } = classroom
    return joinCode === null
      ? yield* Effect.die(new Error("the professor got no join code"))
      : { ...classroom, joinCode }
  })

export type MembershipStatus = "pending" | "active" | "removed"
export type MembershipRole = "student" | "ta"

/**
 * Inserts a classroom taught by `professorId`, straight into the database (test setup, like
 * `Ash.Seed`). Defaults: not archived, students may create petitions, no organization.
 */
export const insertClassroom = (
  app: TestApp,
  options: {
    readonly professorId: string
    readonly organizationId?: string | null
    readonly name?: string
    readonly archived?: boolean
    readonly allowStudentPetitions?: boolean
  },
) =>
  Effect.gen(function* () {
    const joinCode = crypto.randomUUID()
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO classrooms (name, join_code, professor_id, organization_id, archived,
        allow_student_petitions)
      VALUES (${options.name ?? "Test classroom"}, ${joinCode}, ${options.professorId},
        ${options.organizationId ?? null}, ${options.archived ?? false},
        ${options.allowStudentPetitions ?? true})
      RETURNING id
    `
    return { id: row!.id, joinCode }
  }).pipe(Effect.orDie)

/** Sets a classroom's `archived` flag. */
export const setClassroomArchived = (app: TestApp, classroomId: string, archived: boolean) =>
  app.sql`UPDATE classrooms SET archived = ${archived} WHERE id = ${classroomId}`.pipe(
    Effect.asVoid,
    Effect.orDie,
  )

/**
 * Inserts or updates `userId`'s membership of `classroomId` (default: an active student).
 */
export const upsertMembership = (
  app: TestApp,
  options: {
    readonly classroomId: string
    readonly userId: string
    readonly status?: MembershipStatus
    readonly role?: MembershipRole
  },
) =>
  Effect.gen(function* () {
    const status = options.status ?? "active"
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO classroom_memberships (classroom_id, user_id, status, role, joined_at)
      VALUES (${options.classroomId}, ${options.userId}, ${status}, ${options.role ?? "student"},
        CASE WHEN ${status} = 'active' THEN now() AT TIME ZONE 'utc' END)
      ON CONFLICT (classroom_id, user_id)
        DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role
      RETURNING id
    `
    return { id: row!.id }
  }).pipe(Effect.orDie)

/**
 * Positional shorthand for `upsertMembership`, for states the procedures can't reach in one
 * step. Returns the membership id.
 */
export const seedMembership = (
  app: TestApp,
  classroomId: string,
  userId: string,
  status: MembershipStatus,
  role: MembershipRole = "student",
) => Effect.map(upsertMembership(app, { classroomId, userId, status, role }), (row) => row.id)
