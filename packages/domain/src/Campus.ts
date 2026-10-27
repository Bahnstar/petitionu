import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { MeDto } from "./Accounts.ts"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { Invalid } from "./Errors.ts"

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

/**
 * The profile fields a student fills in. Names are trimmed and required, and the graduation
 * year is optional; the server checks them and reports each problem per field.
 */
export const UpdateMyProfileInput = Schema.Struct({
  firstName: Schema.optionalKey(Schema.NullOr(Schema.String)),
  lastName: Schema.optionalKey(Schema.NullOr(Schema.String)),
  graduationYear: Schema.optionalKey(Schema.NullOr(Schema.Int)),
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

export class CampusRpcs extends RpcGroup.make(updateMyProfile, getOrganizations).middleware(
  ActorMiddleware,
) {}
