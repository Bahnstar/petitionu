import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { Forbidden, Invalid, NotFound, Unauthenticated } from "./Errors.ts"
import { Note, OptionalNote, Uuid } from "./Inputs.ts"
import { Timestamp } from "./Timestamps.ts"

export const ContentReportReason = Schema.Literals(["spam", "harassment", "privacy", "other"])
export type ContentReportReason = typeof ContentReportReason.Type

export const ContentReportState = Schema.Literals(["open", "resolved", "dismissed"])
export type ContentReportState = typeof ContentReportState.Type

export const ContentReportOutcome = Schema.Literals(["resolved", "dismissed"])
export type ContentReportOutcome = typeof ContentReportOutcome.Type

/**
 * A report on a petition, or on a comment when `commentId` is set. `targetTitle` and
 * `targetText` copy the content as it was when it was reported.
 */
export const ContentReport = Schema.Struct({
  id: Schema.String,
  petitionId: Schema.String,
  commentId: Schema.NullOr(Schema.String),
  targetTitle: Schema.String,
  targetText: Schema.String,
  reason: ContentReportReason,
  details: Schema.NullOr(Schema.String),
  state: ContentReportState,
  resolutionNote: Schema.NullOr(Schema.String),
  insertedAt: Timestamp,
  resolvedAt: Schema.NullOr(Timestamp),
})
export type ContentReport = typeof ContentReport.Type

/**
 * The ids stay plain strings: the handler answers a malformed one with the message it gives for
 * content the caller can't see.
 */
export const CreateContentReportInput = Schema.Struct({
  /** The reported petition. Ignored when `commentId` is set: the comment's petition is used. */
  petitionId: Schema.optional(Schema.NullOr(Schema.String)),
  commentId: Schema.optional(Schema.NullOr(Schema.String)),
  reason: ContentReportReason,
  /** Optional, up to 5000 characters once trimmed. */
  details: Schema.optional(OptionalNote(5000)),
})
export type CreateContentReportInput = typeof CreateContentReportInput.Type

export const ResolveContentReportInput = Schema.Struct({
  id: Uuid,
  outcome: ContentReportOutcome,
  /** Hides the reported comment or petition; only with `outcome: "resolved"`. */
  hideContent: Schema.optional(Schema.Boolean),
  /** 1 to 5000 characters once trimmed; the reporter can read it. */
  resolutionNote: Note({ maxLength: 5000, required: "length must be greater than or equal to 1" }),
})
export type ResolveContentReportInput = typeof ResolveContentReportInput.Type

/** Reports content the caller can see. Needs a confirmed user with a complete profile. */
export const createContentReport = Rpc.make("createContentReport", {
  payload: CreateContentReportInput,
  success: ContentReport,
  error: Schema.Union([Unauthenticated, Invalid]),
})

/**
 * The reports the caller may see, newest first: their own, their campus's for an admin, all
 * for a superadmin. `state` narrows the list.
 */
export const getContentReports = Rpc.make("getContentReports", {
  payload: { state: Schema.optionalKey(ContentReportState) },
  success: Schema.Array(ContentReport),
}).middleware(RequireUser)

/** Reviews an open report as a superadmin or an admin of its campus, optionally hiding it. */
export const resolveContentReport = Rpc.make("resolveContentReport", {
  payload: ResolveContentReportInput,
  success: ContentReport,
  error: Schema.Union([NotFound, Forbidden, Invalid]),
}).middleware(RequireUser)

export class ModerationRpcs extends RpcGroup.make(
  createContentReport,
  getContentReports,
  resolveContentReport,
)
  .middleware(ActorMiddleware)
  .annotateRpcs(Rpc.ParseOptions, { errors: "all" }) {}
