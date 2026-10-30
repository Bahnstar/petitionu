import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { Forbidden, Invalid, NotFound } from "./Errors.ts"
import { Note, Uuid } from "./Inputs.ts"
import { Timestamp } from "./Timestamps.ts"

export const SupportRequestKind = Schema.Literals(["support", "account_deletion"])
export type SupportRequestKind = typeof SupportRequestKind.Type

export const SupportRequestState = Schema.Literals(["open", "resolved"])
export type SupportRequestState = typeof SupportRequestState.Type

export const SupportRequest = Schema.Struct({
  id: Schema.String,
  kind: SupportRequestKind,
  requesterEmail: Schema.String,
  message: Schema.String,
  state: SupportRequestState,
  resolutionNote: Schema.NullOr(Schema.String),
  insertedAt: Timestamp,
  resolvedAt: Schema.NullOr(Timestamp),
})
export type SupportRequest = typeof SupportRequest.Type

/** A request message or resolution note: 1 to 5000 characters once trimmed. */
const SupportNote = Note({ maxLength: 5000, required: "length must be greater than or equal to 1" })

export const CreateSupportRequestInput = Schema.Struct({
  kind: SupportRequestKind,
  message: SupportNote,
})
export type CreateSupportRequestInput = typeof CreateSupportRequestInput.Type

export const ResolveSupportRequestInput = Schema.Struct({
  id: Uuid,
  resolutionNote: SupportNote,
})
export type ResolveSupportRequestInput = typeof ResolveSupportRequestInput.Type

/** Files a request from the caller, for their campus's operators (or a superadmin). */
export const createSupportRequest = Rpc.make("createSupportRequest", {
  payload: CreateSupportRequestInput,
  success: SupportRequest,
  error: Invalid,
}).middleware(RequireUser)

/** The caller's own requests, newest first. */
export const getMySupportRequests = Rpc.make("getMySupportRequests", {
  success: Schema.Array(SupportRequest),
}).middleware(RequireUser)

/**
 * The requests the caller may see, newest first: their own, their campus's for an admin, all
 * for a superadmin. `state` narrows the list.
 */
export const getSupportRequests = Rpc.make("getSupportRequests", {
  payload: { state: Schema.optionalKey(SupportRequestState) },
  success: Schema.Array(SupportRequest),
}).middleware(RequireUser)

/** Closes an open request with a note the requester can read. */
export const resolveSupportRequest = Rpc.make("resolveSupportRequest", {
  payload: ResolveSupportRequestInput,
  success: SupportRequest,
  error: Schema.Union([NotFound, Forbidden, Invalid]),
}).middleware(RequireUser)

/** The support mailbox; public. */
export const supportContact = Rpc.make("supportContact", { success: Schema.String })

export class SupportRpcs extends RpcGroup.make(
  createSupportRequest,
  getMySupportRequests,
  getSupportRequests,
  resolveSupportRequest,
  supportContact,
)
  .middleware(ActorMiddleware)
  .annotateRpcs(Rpc.ParseOptions, { errors: "all" }) {}
