import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { MeDto } from "./Accounts.ts"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { Invalid } from "./Errors.ts"
import { Note } from "./Inputs.ts"

export const VerificationStatus = Schema.Literals(["pending", "verified", "approved"])
export type VerificationStatus = typeof VerificationStatus.Type

/** A campus, as `getOrganizations` lists it. */
export const OrganizationDto = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  domain: Schema.NullOr(Schema.String),
  logoUrl: Schema.NullOr(Schema.String),
  allowPublicSignatures: Schema.Boolean,
  verificationStatus: VerificationStatus,
})
export type OrganizationDto = typeof OrganizationDto.Type

/** A name: 1 to 100 characters once trimmed. */
const ProfileName = Note({
  maxLength: 100,
  required: "must be present",
  tooLong: "must have length of between 1 and 100",
})

const GraduationYear = Schema.Int.check(
  Schema.makeFilter((year: number) => year >= 1900 && year <= 2100, {
    message: "must be greater than or equal to 1900 and must be less than or equal to 2100",
  }),
)

/** The profile fields a student fills in: both names, and optionally a graduation year. */
export const UpdateMyProfileInput = Schema.Struct({
  firstName: ProfileName,
  lastName: ProfileName,
  graduationYear: Schema.optionalKey(Schema.NullOr(GraduationYear)),
})
export type UpdateMyProfileInput = typeof UpdateMyProfileInput.Type

/**
 * Saves the caller's own profile. Completing it matches a confirmed student without a campus
 * to the single approved or verified organization for their email's domain.
 */
export const updateMyProfile = Rpc.make("updateMyProfile", {
  payload: UpdateMyProfileInput,
  success: MeDto,
  error: Invalid,
}).middleware(RequireUser)

/** Public: every organization. */
export const getOrganizations = Rpc.make("getOrganizations", {
  success: Schema.Array(OrganizationDto),
})

export class CampusRpcs extends RpcGroup.make(updateMyProfile, getOrganizations)
  .middleware(ActorMiddleware)
  .annotateRpcs(Rpc.ParseOptions, { errors: "all" }) {}
