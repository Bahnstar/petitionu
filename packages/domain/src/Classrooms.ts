import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, RequireUser } from "./Actor.ts"
import { Forbidden, Invalid, NotFound, Unauthenticated } from "./Errors.ts"
import { Note, OptionalNote, Uuid } from "./Inputs.ts"
import { Timestamp } from "./Timestamps.ts"

/** The public user shape: id and names. */
export const ClassroomProfessor = Schema.Struct({
  id: Schema.String,
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
})

/** A classroom, as the professor and its active members see it. */
export const ClassroomDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  /** Null for everyone but the classroom's professor. */
  joinCode: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  allowStudentPetitions: Schema.Boolean,
  /** Active members, not counting the professor. */
  memberCount: Schema.Number,
  petitionCount: Schema.Number,
  professorId: Schema.String,
  professor: ClassroomProfessor,
  organizationId: Schema.NullOr(Schema.String),
  insertedAt: Timestamp,
  updatedAt: Timestamp,
})
export type ClassroomDto = typeof ClassroomDto.Type

/** One page of `getMyClassrooms`, with the total count of matching classrooms. */
export const ClassroomPage = Schema.Struct({
  results: Schema.Array(ClassroomDto),
  count: Schema.Number,
  limit: Schema.NullOr(Schema.Number),
  offset: Schema.Number,
  hasMore: Schema.Boolean,
})
export type ClassroomPage = typeof ClassroomPage.Type

export const MembershipRole = Schema.Literals(["student", "ta"])
export type MembershipRole = typeof MembershipRole.Type

export const MembershipStatus = Schema.Literals(["pending", "active", "removed"])
export type MembershipStatus = typeof MembershipStatus.Type

/** A classroom membership. `memberName` is the member's names; no other user fields. */
export const MembershipDto = Schema.Struct({
  id: Schema.String,
  classroomId: Schema.String,
  userId: Schema.String,
  invitedById: Schema.NullOr(Schema.String),
  role: MembershipRole,
  status: MembershipStatus,
  /** Set when the membership becomes active. */
  joinedAt: Schema.NullOr(Timestamp),
  insertedAt: Timestamp,
  memberName: Schema.String,
  user: Schema.Struct({ id: Schema.String }),
  classroom: Schema.Struct({ id: Schema.String, name: Schema.String }),
})
export type MembershipDto = typeof MembershipDto.Type

const ById = { id: Uuid }
const ByClassroom = { classroomId: Uuid }

/** Up to 255 characters once trimmed. */
const ClassroomName = Note({ maxLength: 255, required: "is required" })
/** Optional, up to 2000 characters once trimmed. */
const ClassroomDescription = OptionalNote(2000)

const ClassroomInput = {
  name: ClassroomName,
  description: Schema.optionalKey(ClassroomDescription),
  allowStudentPetitions: Schema.optionalKey(Schema.Boolean),
}

/** Classrooms visible to the caller: those they teach or are an active member of. */
export const getClassrooms = Rpc.make("getClassrooms", {
  success: Schema.Array(ClassroomDto),
}).middleware(RequireUser)

export const getClassroomById = Rpc.make("getClassroomById", {
  payload: ById,
  success: ClassroomDto,
  error: NotFound,
}).middleware(RequireUser)

/**
 * The classrooms the caller teaches or is an active member of, sorted by name. `archived`
 * filters on the archived flag; without `limit`, every classroom is returned.
 */
export const getMyClassrooms = Rpc.make("getMyClassrooms", {
  payload: {
    archived: Schema.optionalKey(Schema.Boolean),
    limit: Schema.optionalKey(Schema.Number),
    offset: Schema.optionalKey(Schema.Number),
  },
  success: ClassroomPage,
}).middleware(RequireUser)

/** Professors and admins with a complete profile; the classroom joins their campus. */
export const createClassroom = Rpc.make("createClassroom", {
  payload: ClassroomInput,
  success: ClassroomDto,
  error: Schema.Union([Forbidden, Invalid, Unauthenticated]),
}).middleware(RequireUser)

const ClassroomUpdate = {
  id: Uuid,
  name: Schema.optionalKey(ClassroomName),
  description: Schema.optionalKey(ClassroomDescription),
  allowStudentPetitions: Schema.optionalKey(Schema.Boolean),
}

const ClassroomWriteError = Schema.Union([NotFound, Forbidden, Invalid])

/** The classroom's professor only, as are archive, unarchive and regenerateJoinCode. */
export const updateClassroom = Rpc.make("updateClassroom", {
  payload: ClassroomUpdate,
  success: ClassroomDto,
  error: ClassroomWriteError,
}).middleware(RequireUser)

export const archiveClassroom = Rpc.make("archiveClassroom", {
  payload: ById,
  success: ClassroomDto,
  error: ClassroomWriteError,
}).middleware(RequireUser)

export const unarchiveClassroom = Rpc.make("unarchiveClassroom", {
  payload: ById,
  success: ClassroomDto,
  error: ClassroomWriteError,
}).middleware(RequireUser)

export const regenerateJoinCode = Rpc.make("regenerateJoinCode", {
  payload: ById,
  success: ClassroomDto,
  error: ClassroomWriteError,
}).middleware(RequireUser)

/**
 * Memberships visible to the caller: their own, every membership of classrooms they teach,
 * and every membership of classrooms where they are an active TA.
 */
export const getClassroomMemberships = Rpc.make("getClassroomMemberships", {
  success: Schema.Array(MembershipDto),
}).middleware(RequireUser)

export const getMembershipsForClassroom = Rpc.make("getMembershipsForClassroom", {
  payload: ByClassroom,
  success: Schema.Array(MembershipDto),
}).middleware(RequireUser)

export const getPendingMemberships = Rpc.make("getPendingMemberships", {
  payload: ByClassroom,
  success: Schema.Array(MembershipDto),
}).middleware(RequireUser)

const MembershipCreateError = Schema.Union([Forbidden, Invalid])
const MembershipWriteError = Schema.Union([NotFound, Forbidden, Invalid])

/**
 * Confirmed users join a non-archived classroom as active students. The code stays a plain
 * string: whatever the user typed, a code that matches no classroom gets the same message.
 */
export const joinClassroomByCode = Rpc.make("joinClassroomByCode", {
  payload: { joinCode: Schema.String },
  success: MembershipDto,
  error: MembershipCreateError,
}).middleware(RequireUser)

/** Confirmed users ask to join; the membership stays pending until approved. */
export const requestToJoinClassroom = Rpc.make("requestToJoinClassroom", {
  payload: ByClassroom,
  success: MembershipDto,
  error: MembershipCreateError,
}).middleware(RequireUser)

/** The professor invites students or TAs; an active TA invites students. Emails the invitee. */
export const inviteToClassroom = Rpc.make("inviteToClassroom", {
  payload: {
    classroomId: Uuid,
    email: Schema.String,
    role: Schema.optionalKey(MembershipRole),
  },
  success: MembershipDto,
  error: MembershipCreateError,
}).middleware(RequireUser)

/** The professor or an active TA approves a pending membership; emails the member. */
export const approveMembership = Rpc.make("approveMembership", {
  payload: ById,
  success: MembershipDto,
  error: MembershipWriteError,
}).middleware(RequireUser)

/** The professor or an active TA removes a member; a student leaves their own membership. */
export const removeFromClassroom = Rpc.make("removeFromClassroom", {
  payload: ById,
  success: MembershipDto,
  error: MembershipWriteError,
}).middleware(RequireUser)

/** The professor only. */
export const promoteToTa = Rpc.make("promoteToTa", {
  payload: ById,
  success: MembershipDto,
  error: MembershipWriteError,
}).middleware(RequireUser)

/** The professor only. */
export const demoteToStudent = Rpc.make("demoteToStudent", {
  payload: ById,
  success: MembershipDto,
  error: MembershipWriteError,
}).middleware(RequireUser)

export class ClassroomRpcs extends RpcGroup.make(
  getClassrooms,
  getClassroomById,
  getMyClassrooms,
  createClassroom,
  updateClassroom,
  archiveClassroom,
  unarchiveClassroom,
  regenerateJoinCode,
  getClassroomMemberships,
  getMembershipsForClassroom,
  getPendingMemberships,
  joinClassroomByCode,
  requestToJoinClassroom,
  inviteToClassroom,
  approveMembership,
  removeFromClassroom,
  promoteToTa,
  demoteToStudent,
)
  .middleware(ActorMiddleware)
  .annotateRpcs(Rpc.ParseOptions, { errors: "all" }) {}
