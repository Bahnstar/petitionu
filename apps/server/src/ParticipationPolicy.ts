import { invalidField, type SignedIn } from "@petitionu/domain"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { isUuid } from "./Input.ts"
import { petitionManageable, petitionVisible } from "./PetitionPolicy.ts"

/** What the caller wants to add to the petition: each kind has its own rules. */
export type ParticipationKind = "signature" | "comment" | "update"

const rejected = (message: string) => invalidField("petitionId", message)

interface LockedPetition {
  readonly status: string | null
  readonly deadlinePassed: boolean
  readonly allowComments: boolean
  readonly classroomId: string | null
  readonly classroomOpen: boolean
  readonly organizationId: string | null
  readonly allowPublicSignatures: boolean
  readonly canManage: boolean
}

/** Ash's `CheckPetition` campus rule: campus petitions take signatures from their own campus. */
const campusAllows = (petition: LockedPetition, user: SignedIn) =>
  petition.classroomId !== null ||
  petition.organizationId === null ||
  petition.organizationId === user.organizationId ||
  petition.allowPublicSignatures

const check = (petition: LockedPetition, user: SignedIn, kind: ParticipationKind) => {
  if (!petition.classroomOpen) return rejected("This classroom is archived or unavailable.")
  if (kind === "update") {
    return petition.canManage
      ? undefined
      : rejected("Only the petition owner or classroom professor can publish updates.")
  }
  if (petition.status !== "open") return rejected("This petition is closed.")
  if (petition.deadlinePassed) return rejected("This petition's deadline has passed.")
  if (kind === "comment" && !petition.allowComments) {
    return rejected("Comments are disabled for this petition.")
  }
  if (kind === "signature" && !campusAllows(petition, user)) {
    return rejected("Only students at this campus can sign this petition.")
  }
  return undefined
}

/**
 * Ash's `CheckPetition`: locks the petition `FOR UPDATE` (so call it inside the transaction that
 * writes), then checks that `user` may add a `kind` to it. The petition must be visible to the
 * user and its classroom, if any, not archived. Signatures and comments need an open petition
 * before its deadline; comments need comments allowed; signatures need the right campus.
 * Updates need the user to manage the petition. Fails with `Invalid` on `petitionId`.
 */
export const checkPetition = (
  sql: SqlClient.SqlClient,
  user: SignedIn,
  petitionId: string,
  kind: ParticipationKind,
) =>
  Effect.gen(function* () {
    if (!isUuid(petitionId)) return yield* rejected("This petition is unavailable.")
    const [petition] = yield* sql<LockedPetition>`
      SELECT p.status,
        coalesce(p.deadline <= (now() AT TIME ZONE 'utc'), false) AS deadline_passed,
        coalesce(p.allow_comments, true) AS allow_comments,
        p.classroom_id,
        (p.classroom_id IS NULL OR coalesce(c.archived = false, false)) AS classroom_open,
        p.organization_id,
        coalesce(o.allow_public_signatures, false) AS allow_public_signatures,
        coalesce(${petitionManageable(sql, user, "p")}, false) AS can_manage
      FROM petition p
      LEFT JOIN classrooms c ON c.id = p.classroom_id
      LEFT JOIN organization o ON o.id = p.organization_id
      WHERE p.id = ${petitionId} AND ${petitionVisible(sql, user, "p")}
      FOR UPDATE OF p
    `.pipe(Effect.orDie)
    if (!petition) return yield* rejected("This petition is unavailable.")
    const error = check(petition, user, kind)
    if (error) return yield* error
  })
