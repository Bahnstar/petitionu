import { Forbidden, type MembershipStatus, type SignedIn } from "@petitionu/domain"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"

export const forbidden = new Forbidden({ message: "Forbidden" })

/** A SQL condition: `actorId` is an active TA of the classroom whose id is `classroomId`. */
export const activeTa = (
  sql: SqlClient.SqlClient,
  actorId: string,
  classroomId: Statement.Fragment,
) => sql`EXISTS (
  SELECT 1 FROM classroom_memberships ta
  WHERE ta.classroom_id = ${classroomId} AND ta.user_id = ${actorId}
    AND ta.role = 'ta' AND ta.status = 'active')`

/**
 * Classrooms the actor teaches or is an active member of, as a filter on `classrooms` aliased
 * `alias`.
 */
export const classroomVisible = (sql: SqlClient.SqlClient, actorId: string, alias = "c") => {
  const c = sql(alias)
  return sql`(
    ${c}.professor_id = ${actorId} OR EXISTS (
      SELECT 1 FROM classroom_memberships cv_m
      WHERE cv_m.classroom_id = ${c}.id AND cv_m.user_id = ${actorId}
        AND cv_m.status = 'active'))`
}

/**
 * A SQL expression for the join code of the classroom aliased `c`: only its professor gets it,
 * as `isProfessor` decides. TAs, members and site admins get null. A code admits anyone who
 * has it, with no approval.
 */
export const visibleJoinCode = (sql: SqlClient.SqlClient, actorId: string) =>
  sql`CASE WHEN c.professor_id = ${actorId} THEN c.join_code::text END`

/**
 * The actor's own memberships, and those of classrooms they teach or are an active TA of, as a
 * filter on `classroom_memberships` aliased `m` joined to its `classrooms` aliased `c`.
 */
export const membershipVisible = (sql: SqlClient.SqlClient, actorId: string) => sql`(
  m.user_id = ${actorId} OR c.professor_id = ${actorId}
    OR ${activeTa(sql, actorId, sql`m.classroom_id`)})`

/** Creating a classroom: professors and campus admins. */
export const authorizeCreateClassroom = (user: SignedIn) =>
  user.role === "professor" || user.role === "admin" ? Effect.void : Effect.fail(forbidden)

export const isConfirmed = (user: SignedIn) => user.confirmedAt !== null

/** Unconfirmed users can't create, change or remove memberships. */
export const requireConfirmed = (user: SignedIn) =>
  isConfirmed(user) ? Effect.void : Effect.fail(forbidden)

/** The columns of a membership being changed that the decisions look at. */
export interface MembershipTarget {
  readonly userId: string
  readonly role: "student" | "ta"
  readonly status: MembershipStatus
  readonly professorId: string
  readonly archived: boolean
  /** Whether the actor is an active TA of the membership's classroom. */
  readonly actorIsTa: boolean
}

export const isProfessor = (user: SignedIn, target: { readonly professorId: string }) =>
  target.professorId === user.id

const isStaff = (user: SignedIn, target: Pick<MembershipTarget, "professorId" | "actorIsTa">) =>
  isProfessor(user, target) || target.actorIsTa

/**
 * Inviting, with the membership the invitation would create as the target: the professor
 * invites anyone; an active TA invites students only.
 */
export const canInvite = (
  user: SignedIn,
  target: Pick<MembershipTarget, "role" | "professorId" | "actorIsTa">,
) => isProfessor(user, target) || (target.actorIsTa && target.role === "student")

/** Approving a pending request of an open classroom: its professor or an active TA. */
export const canApprove = (user: SignedIn, target: MembershipTarget) =>
  isStaff(user, target) && target.status === "pending" && !target.archived

/**
 * Removing or declining a membership not already removed: staff remove anyone, an active TA
 * included; an active student may leave.
 */
export const canRemove = (user: SignedIn, target: MembershipTarget) =>
  target.status !== "removed" &&
  (isStaff(user, target) ||
    (target.userId === user.id && target.role === "student" && target.status === "active"))

/** Promoting and demoting an active member: the professor only. */
export const canChangeRole = (user: SignedIn, target: MembershipTarget) =>
  isProfessor(user, target) && target.status === "active"

/**
 * What the actor may do to a classroom, for the classroom DTO. Editing, archiving and the join
 * code are the professor's (`isProfessor`); managing members needs a confirmed professor or
 * active TA, as the membership writes enforce. Each membership's `membershipEligibility` says
 * which actions apply to it.
 */
export const classroomEligibility = (
  user: SignedIn,
  target: Pick<MembershipTarget, "professorId" | "actorIsTa">,
) => ({
  canManageClassroom: isProfessor(user, target),
  canManageMembers: isConfirmed(user) && isStaff(user, target),
})

/**
 * What the actor may do to a membership, for the membership DTO: the same decisions the writes
 * make after `requireConfirmed`.
 */
export const membershipEligibility = (user: SignedIn, target: MembershipTarget) => {
  const confirmed = isConfirmed(user)
  return {
    canApprove: confirmed && canApprove(user, target),
    canRemove: confirmed && canRemove(user, target),
    canChangeRole: confirmed && canChangeRole(user, target),
  }
}
