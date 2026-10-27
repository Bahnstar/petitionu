import { CurrentActor, Invalid, type SignedIn, Unauthenticated } from "@petitionu/domain"
import { Effect } from "effect"

const blank = (value: string | null) => value === null || value.trim() === ""

const invalid = (message: string) => new Invalid({ message, fields: [] })

/**
 * The participation rule (Ash's `Participant` validation): creating petitions, signatures,
 * comments, classroom requests or reports needs a signed-in user who has confirmed their email
 * and completed their campus profile. Returns that user.
 */
export const requireParticipant: Effect.Effect<SignedIn, Unauthenticated | Invalid, CurrentActor> =
  Effect.gen(function* () {
    const actor = yield* CurrentActor
    if (actor._tag !== "SignedIn") {
      return yield* new Unauthenticated({ message: "Sign in to participate." })
    }
    if (actor.confirmedAt === null) {
      return yield* invalid("Confirm your email before participating.")
    }
    if (actor.organizationId === null || blank(actor.firstName) || blank(actor.lastName)) {
      return yield* invalid("Complete your campus profile before participating.")
    }
    return actor
  })
