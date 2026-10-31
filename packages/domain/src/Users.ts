import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ActorMiddleware, RequireUser, Role } from "./Actor.ts"
import { Forbidden, Invalid, NotFound } from "./Errors.ts"
import { Uuid } from "./Inputs.ts"
import { PetitionDto } from "./Petitions.ts"
import { Timestamp } from "./Timestamps.ts"

/** Anyone may see a user's id and names. */
export const PublicUser = Schema.Struct({
  id: Schema.String,
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
})
export type PublicUser = typeof PublicUser.Type

/** What the user themself, a superadmin or an admin of their organization may see. */
export const UserDetails = Schema.Struct({
  ...PublicUser.fields,
  email: Schema.String,
  role: Role,
  graduationYear: Schema.NullOr(Schema.Number),
  organizationId: Schema.NullOr(Schema.String),
  emailVerified: Schema.Boolean,
  profileComplete: Schema.Boolean,
})
export type UserDetails = typeof UserDetails.Type

/** One of the user's own petitions, as the dashboard lists it: the petition list shape. */
export const ActivityPetition = PetitionDto
export type ActivityPetition = typeof ActivityPetition.Type

/** One of the user's own signatures, with the petition it's on. */
export const ActivitySignature = Schema.Struct({
  id: Schema.String,
  insertedAt: Timestamp,
  petition: ActivityPetition,
})
export type ActivitySignature = typeof ActivitySignature.Type

/** The user's own activity: only ever shown to the user themself. */
export const UserWithActivity = Schema.Struct({
  ...UserDetails.fields,
  numPetitions: Schema.Number,
  numSigned: Schema.Number,
  numPetitionSignees: Schema.Number,
  totalPetitionSignatures: Schema.Number,
  /** The four most recent. */
  petitions: Schema.Array(ActivityPetition),
  /** The four most recent. */
  signatures: Schema.Array(ActivitySignature),
})
export type UserWithActivity = typeof UserWithActivity.Type

/** A user in the shape the caller's access allows: most specific first. */
export const UserDto = Schema.Union([UserWithActivity, UserDetails, PublicUser])
export type UserDto = typeof UserDto.Type

export const Preference = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  value: Schema.NullOr(Schema.String),
})
export type Preference = typeof Preference.Type

export const Notification = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  status: Schema.Literals(["unread", "read", "archived"]),
  insertedAt: Timestamp,
})
export type Notification = typeof Notification.Type

/**
 * A user the caller may see; `NotFound` otherwise. With `includeStats`, the caller's own
 * record carries their activity; nobody else's does.
 */
export const getUserById = Rpc.make("getUserById", {
  payload: { id: Uuid, includeStats: Schema.optionalKey(Schema.Boolean) },
  success: UserDto,
  error: NotFound,
})

/** The users the caller may see: themself, everyone for a superadmin, their campus for an admin. */
export const getUsers = Rpc.make("getUsers", { success: Schema.Array(UserDto) })

export const setUserRole = Rpc.make("setUserRole", {
  payload: { id: Uuid, role: Role },
  success: UserDetails,
  error: Schema.Union([NotFound, Forbidden, Invalid]),
}).middleware(RequireUser)

/** The caller's own preferences. */
export const getPreferences = Rpc.make("getPreferences", {
  success: Schema.Array(Preference),
}).middleware(RequireUser)

/** The caller's own notifications, newest first. */
export const getNotifications = Rpc.make("getNotifications", {
  success: Schema.Array(Notification),
}).middleware(RequireUser)

export class UsersRpcs extends RpcGroup.make(
  getUserById,
  getUsers,
  setUserRole,
  getPreferences,
  getNotifications,
)
  .middleware(ActorMiddleware)
  .annotateRpcs(Rpc.ParseOptions, { errors: "all" }) {}
