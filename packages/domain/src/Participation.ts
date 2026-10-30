import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { Forbidden, Invalid, NotFound, Unauthenticated } from "./Errors.ts"
import { Note, OptionalNote, Uuid } from "./Inputs.ts"

/** A signature. Who signed is never exposed; `hasSigned` on the petition tells the caller. */
export const SignatureDto = Schema.Struct({
  id: Schema.String,
  petitionId: Schema.String,
  reason: Schema.NullOr(Schema.String),
  isVerified: Schema.Boolean,
  /** ISO 8601, UTC. */
  insertedAt: Schema.String,
})
export type SignatureDto = typeof SignatureDto.Type

export const CommentDto = Schema.Struct({
  id: Schema.String,
  petitionId: Schema.String,
  parentCommentId: Schema.NullOr(Schema.String),
  text: Schema.NullOr(Schema.String),
  /** The commenter's name, or "Student" when it's unknown. */
  author: Schema.String,
  /** ISO 8601, UTC. */
  insertedAt: Schema.String,
  /** The caller wrote it and may still edit or delete it (not in an archived classroom). */
  canEdit: Schema.Boolean,
})
export type CommentDto = typeof CommentDto.Type

export const UpdateDto = Schema.Struct({
  id: Schema.String,
  petitionId: Schema.String,
  title: Schema.String,
  body: Schema.String,
  /** ISO 8601, UTC. */
  insertedAt: Schema.String,
})
export type UpdateDto = typeof UpdateDto.Type

const petitionFilter = { petitionId: Schema.optional(Schema.NullOr(Uuid)) }

/** Comment text: up to 5000 characters once trimmed. */
const CommentText = Note({ maxLength: 5000, required: "must be present" })

/**
 * Signs an open petition once. Needs a confirmed user with a complete profile; a campus
 * petition also needs the signer's campus unless the campus accepts public signatures.
 */
export const createSignature = Rpc.make("createSignature", {
  /** `reason`: optional, up to 2000 characters once trimmed. */
  payload: { petitionId: Uuid, reason: Schema.optional(OptionalNote(2000)) },
  success: SignatureDto,
  error: Schema.Union([Unauthenticated, Invalid]),
})

/**
 * Withdraws the caller's own signature. The petition must still take signatures: open, before
 * its deadline, and not in an archived classroom.
 */
export const deleteSignature = Rpc.make("deleteSignature", {
  payload: { petitionId: Uuid },
  error: Schema.Union([Unauthenticated, Invalid]),
})

/** Signatures on petitions the caller may see, oldest first; optionally one petition's. */
export const getSignatures = Rpc.make("getSignatures", {
  payload: petitionFilter,
  success: Schema.Array(SignatureDto),
}).middleware(RequireUser)

/** Comments on an open petition that allows them; `parentCommentId` replies on the same petition. */
export const createComment = Rpc.make("createComment", {
  payload: {
    petitionId: Uuid,
    text: CommentText,
    parentCommentId: Schema.optional(Schema.NullOr(Uuid)),
  },
  success: CommentDto,
  error: Schema.Union([Unauthenticated, Invalid]),
})

/**
 * Changes the text of the caller's own comment, checked as for `createComment`. The comment and
 * its petition must be visible to the caller and not in an archived classroom.
 */
export const updateComment = Rpc.make("updateComment", {
  payload: { id: Uuid, text: CommentText },
  success: CommentDto,
  error: Schema.Union([NotFound, Forbidden, Invalid]),
}).middleware(RequireUser)

/**
 * Deletes the caller's own comment, under `updateComment`'s rules. The row stays, without its
 * text, so replies and content reports keep their references; it drops out of every read.
 */
export const deleteComment = Rpc.make("deleteComment", {
  payload: { id: Uuid },
  error: Schema.Union([NotFound, Forbidden, Invalid]),
}).middleware(RequireUser)

/** Comments that aren't hidden or deleted, on petitions the caller may see, oldest first. */
export const getComments = Rpc.make("getComments", {
  payload: petitionFilter,
  success: Schema.Array(CommentDto),
}).middleware(RequireUser)

/**
 * Publishes an update on a petition the caller wrote or whose classroom they teach: a title of
 * up to 200 characters and a body of up to 20000.
 */
export const createUpdate = Rpc.make("createUpdate", {
  payload: {
    petitionId: Uuid,
    title: Note({ maxLength: 200, required: "is required" }),
    body: Note({ maxLength: 20000, required: "is required" }),
  },
  success: UpdateDto,
  error: Schema.Union([Unauthenticated, Invalid]),
})

/** Updates on petitions the caller may see, oldest first; optionally one petition's. */
export const getUpdates = Rpc.make("getUpdates", {
  payload: petitionFilter,
  success: Schema.Array(UpdateDto),
}).middleware(RequireUser)

/** One petition's updates, newest first (empty when the caller can't see the petition). */
export const getUpdatesForPetition = Rpc.make("getUpdatesForPetition", {
  payload: { petitionId: Uuid },
  success: Schema.Array(UpdateDto),
}).middleware(RequireUser)

export class ParticipationRpcs extends RpcGroup.make(
  createSignature,
  deleteSignature,
  getSignatures,
  createComment,
  updateComment,
  deleteComment,
  getComments,
  createUpdate,
  getUpdates,
  getUpdatesForPetition,
)
  .middleware(ActorMiddleware)
  .annotateRpcs(Rpc.ParseOptions, { errors: "all" }) {}
