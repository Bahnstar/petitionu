import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { Forbidden, Invalid, NotFound, Unauthenticated } from "./Errors.ts"
import { Note, Uuid } from "./Inputs.ts"
import { Deadline, Timestamp } from "./Timestamps.ts"

export const PetitionStatus = Schema.Literals(["open", "closed", "victory"])
export type PetitionStatus = typeof PetitionStatus.Type

export const CategoryDto = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
})
export type CategoryDto = typeof CategoryDto.Type

/** The fields of a petition anyone with the link may see, guests included. */
const sharedFields = {
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  status: PetitionStatus,
  classroomId: Schema.NullOr(Schema.String),
  organizationId: Schema.NullOr(Schema.String),
  hasSigned: Schema.Boolean,
  canManage: Schema.Boolean,
  goal: Schema.NullOr(Schema.Number),
  signaturesCount: Schema.Number,
  daysLeft: Schema.Number,
  trending: Schema.Boolean,
  /** The author's name; "Anonymous student" for anonymous petitions. */
  author: Schema.String,
  allowComments: Schema.Boolean,
  isAnonymous: Schema.Boolean,
  /** Sent to the second. */
  deadline: Schema.NullOr(Deadline),
  insertedAt: Timestamp,
}

/** What a guest gets from `getPetitionById`: the shared fields and the category's name. */
export const SharedPetitionDto = Schema.Struct({
  ...sharedFields,
  category: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String) })),
})
export type SharedPetitionDto = typeof SharedPetitionDto.Type

/** A petition as signed-in users see it in lists and after writes. */
export const PetitionDto = Schema.Struct({
  ...sharedFields,
  categoryId: Schema.NullOr(Schema.String),
  category: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      name: Schema.NullOr(Schema.String),
      color: Schema.NullOr(Schema.String),
    }),
  ),
})
export type PetitionDto = typeof PetitionDto.Type

export const PetitionCommentDto = Schema.Struct({
  id: Schema.String,
  text: Schema.NullOr(Schema.String),
  insertedAt: Timestamp,
  author: Schema.String,
  /** The caller wrote it and may still edit or delete it (not in an archived classroom). */
  canEdit: Schema.Boolean,
})
export const PetitionSignatureDto = Schema.Struct({
  id: Schema.String,
  reason: Schema.NullOr(Schema.String),
  insertedAt: Timestamp,
})
export const PetitionUpdateDto = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  body: Schema.NullOr(Schema.String),
  insertedAt: Timestamp,
})

/** A petition page for a signed-in user: the petition with its comments, signatures and updates. */
export const PetitionDetailDto = Schema.Struct({
  ...PetitionDto.fields,
  comments: Schema.Array(PetitionCommentDto),
  signatures: Schema.Array(PetitionSignatureDto),
  updates: Schema.Array(PetitionUpdateDto),
})
export type PetitionDetailDto = typeof PetitionDetailDto.Type

const Title = Note({ maxLength: 200, required: "must be present" })
const Description = Note({ maxLength: 20000, required: "must be present" })

/** A whole number from 1. One filter, so a value fails with a single message. */
const Goal = Schema.Number.check(
  Schema.makeFilter((goal: number) => {
    if (!Number.isSafeInteger(goal)) return "is invalid"
    return goal >= 1 || "must be more than or equal to 1"
  }),
)

/** ISO 8601. Stays a string for the client; the handler reads it as a date. */
const DeadlineInput = Schema.String.check(
  Schema.makeFilter((value: string) => !Number.isNaN(Date.parse(value)), {
    message: "is invalid",
  }),
)

const OptionalFlag = Schema.optional(Schema.Boolean).annotate({ message: "is invalid" })

/** A petition's settings; omitted fields keep their value (or default on create). */
const petitionSettings = {
  // The message for what isn't a number, `null` included.
  goal: Schema.optional(Goal).annotate({ message: "must be present" }),
  /** `null` clears the deadline. */
  deadline: Schema.optional(Schema.NullOr(DeadlineInput)),
  allowComments: OptionalFlag,
  isAnonymous: OptionalFlag,
}

/** A new petition: a title of up to 200 characters, a description of up to 20000. */
export const CreatePetitionInput = Schema.Struct({
  title: Title,
  description: Description,
  ...petitionSettings,
  categoryId: Uuid,
})
export type CreatePetitionInput = typeof CreatePetitionInput.Type

/** The editable fields of a petition. Omitted fields keep their value. */
export const PetitionInputFields = {
  title: Schema.optional(Title),
  description: Schema.optional(Description),
  ...petitionSettings,
}
export const PetitionInput = Schema.Struct(PetitionInputFields)
export type PetitionInput = typeof PetitionInput.Type

/** Public. */
export const getCategories = Rpc.make("getCategories", { success: Schema.Array(CategoryDto) })

/** Every petition the caller may see, newest first; optionally only one campus's. */
export const getPetitions = Rpc.make("getPetitions", {
  payload: { organizationId: Schema.optional(Schema.NullOr(Uuid)) },
  success: Schema.Array(PetitionDto),
}).middleware(RequireUser)

/** Every petition outside classrooms the caller may see, newest first. */
export const getPublicPetitions = Rpc.make("getPublicPetitions", {
  success: Schema.Array(PetitionDto),
}).middleware(RequireUser)

/**
 * Public. Signed-in callers get `PetitionDetailDto`; guests get `SharedPetitionDto`. A hidden
 * petition, or a classroom petition the caller can't see, is `NotFound`.
 */
export const getPetitionById = Rpc.make("getPetitionById", {
  payload: { id: Uuid },
  success: Schema.Union([PetitionDetailDto, SharedPetitionDto]),
  error: NotFound,
})

/** A classroom's petitions the caller may see: newest first, or by goal (largest first). */
export const getClassroomPetitions = Rpc.make("getClassroomPetitions", {
  payload: {
    classroomId: Uuid,
    sort: Schema.optional(Schema.Literals(["newest", "goal"])),
  },
  success: Schema.Array(PetitionDto),
}).middleware(RequireUser)

/** Needs a confirmed user with a complete profile; the petition joins the author's campus. */
export const createPetition = Rpc.make("createPetition", {
  payload: CreatePetitionInput,
  success: PetitionDto,
  error: Schema.Union([Unauthenticated, Invalid]),
})

/** Like `createPetition`, inside a classroom the caller teaches or is an active member of. */
export const createClassroomPetition = Rpc.make("createClassroomPetition", {
  payload: { ...CreatePetitionInput.fields, classroomId: Uuid },
  success: PetitionDto,
  error: Schema.Union([Unauthenticated, Invalid]),
})

/** The author or the classroom's professor edits a visible petition. */
export const updatePetition = Rpc.make("updatePetition", {
  payload: { id: Uuid, ...PetitionInputFields },
  success: PetitionDto,
  error: Schema.Union([NotFound, Forbidden, Invalid]),
}).middleware(RequireUser)

export const closePetition = Rpc.make("closePetition", {
  payload: { id: Uuid },
  success: PetitionDto,
  error: Schema.Union([NotFound, Forbidden]),
}).middleware(RequireUser)

export const markPetitionVictory = Rpc.make("markPetitionVictory", {
  payload: { id: Uuid },
  success: PetitionDto,
  error: Schema.Union([NotFound, Forbidden]),
}).middleware(RequireUser)

export class PetitionRpcs extends RpcGroup.make(
  getCategories,
  getPetitions,
  getPublicPetitions,
  getPetitionById,
  getClassroomPetitions,
  createPetition,
  createClassroomPetition,
  updatePetition,
  closePetition,
  markPetitionVictory,
)
  .middleware(ActorMiddleware)
  .annotateRpcs(Rpc.ParseOptions, { errors: "all" }) {}
