import { Effect } from "effect"
import type { TestApp } from "./harness.ts"

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
