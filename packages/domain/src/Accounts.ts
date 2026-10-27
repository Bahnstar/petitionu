import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, Role } from "./Actor.ts"
import { NotFound } from "./Errors.ts"

export const OrganizationSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
})

/** The signed-in user's own account, as `getMe` returns it. */
export const MeDto = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
  role: Role,
  /** ISO 8601, UTC. */
  insertedAt: Schema.String,
  graduationYear: Schema.NullOr(Schema.Number),
  emailVerified: Schema.Boolean,
  profileComplete: Schema.Boolean,
  organizationId: Schema.NullOr(Schema.String),
  organization: Schema.NullOr(OrganizationSummary),
})
export type MeDto = typeof MeDto.Type

/** Public: a guest gets `NotFound`, which the web app reads as "signed out". */
export const getMe = Rpc.make("getMe", { success: MeDto, error: NotFound })

export class AccountsRpcs extends RpcGroup.make(getMe).middleware(ActorMiddleware) {}
