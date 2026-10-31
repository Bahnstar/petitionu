import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { FieldError, Forbidden, Invalid, NotFound, Unauthenticated } from "./Errors.ts"
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

/** A petition's settings; omitted fields keep their value (or default on create). */
const petitionSettings = {
  goal: Schema.optional(Schema.NullOr(Schema.Number)),
  /** ISO 8601. */
  deadline: Schema.optional(Schema.NullOr(Schema.String)),
  allowComments: Schema.optional(Schema.NullOr(Schema.Boolean)),
  isAnonymous: Schema.optional(Schema.NullOr(Schema.Boolean)),
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

/** A petition's input with the goal checked and the deadline parsed. */
export interface NormalizedPetitionInput {
  readonly title?: string
  readonly description?: string
  readonly goal?: number | null
  readonly deadline?: Date | null
  readonly allowComments?: boolean | null
  readonly isAnonymous?: boolean | null
}

type Checked<A> = { readonly value: A; readonly error?: string }

const checkGoal = (goal: number | null | undefined, required: boolean): Checked<typeof goal> => {
  if (goal === undefined || goal === null) {
    return required ? { value: goal, error: "must be present" } : { value: goal }
  }
  if (!Number.isSafeInteger(goal)) return { value: goal, error: "is invalid" }
  if (goal < 1) return { value: goal, error: "must be more than or equal to 1" }
  return { value: goal }
}

const checkDeadline = (
  raw: string | null | undefined,
  now: Date,
): Checked<Date | null | undefined> => {
  if (raw === null || raw === undefined) return { value: raw }
  const deadline = new Date(raw)
  if (Number.isNaN(deadline.getTime())) return { value: undefined, error: "is invalid" }
  // Deadlines are stored to the second, like Ash's `:utc_datetime`.
  deadline.setUTCMilliseconds(0)
  if (deadline.getTime() <= now.getTime()) {
    return { value: deadline, error: "Choose a deadline in the future." }
  }
  return { value: deadline }
}

/**
 * Checks what the payload schema can't: the goal (which defaults to 1000 on create) and the
 * deadline, which must be in the future. The title and description arrive checked and trimmed.
 * Omitted fields stay omitted in `value`.
 */
export const validatePetitionInput = (
  input: PetitionInput,
  options: { readonly mode: "create" | "update"; readonly now: Date },
):
  | { readonly ok: true; readonly value: NormalizedPetitionInput }
  | { readonly ok: false; readonly errors: ReadonlyArray<FieldError> } => {
  const creating = options.mode === "create"
  const checks = {
    title: { value: input.title },
    description: { value: input.description },
    goal: checkGoal(
      creating && input.goal === undefined ? 1000 : input.goal,
      creating || input.goal !== undefined,
    ),
    deadline: checkDeadline(input.deadline, options.now),
    allowComments: { value: input.allowComments },
    isAnonymous: { value: input.isAnonymous },
  } satisfies Record<keyof NormalizedPetitionInput, Checked<unknown>>
  const entries = Object.entries(checks) as Array<[string, Checked<unknown>]>
  const errors = entries.flatMap(([field, check]) =>
    check.error === undefined ? [] : [{ field, message: check.error }],
  )
  if (errors.length > 0) return { ok: false, errors }
  const value = Object.fromEntries(
    entries
      .filter(([, check]) => check.value !== undefined)
      .map(([key, check]) => [key, check.value]),
  ) as NormalizedPetitionInput
  return { ok: true, value }
}

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
