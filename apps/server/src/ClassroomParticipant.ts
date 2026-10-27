import { type Actor, Invalid } from "@petitionu/domain"
import { Effect } from "effect"

const blank = (value: string | null) => value === null || value.trim() === ""

const invalid = (message: string) => Effect.fail(new Invalid({ message, fields: [] }))

/**
 * The participation check (`Petitionu.Post.Validations.Participant`): only confirmed users
 * with a campus and both names may take part. Classroom creation uses it.
 *
 * T09 ports the same check for petitions; once both are merged, this should be replaced by
 * the shared one.
 */
export const requireClassroomParticipant = (actor: Actor) => {
  if (actor._tag === "Guest") return invalid("Sign in to participate.")
  if (actor.confirmedAt === null) return invalid("Confirm your email before participating.")
  if (actor.organizationId === null || blank(actor.firstName) || blank(actor.lastName)) {
    return invalid("Complete your campus profile before participating.")
  }
  return Effect.void
}
