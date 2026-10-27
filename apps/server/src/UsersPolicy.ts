import { type Actor, Forbidden, invalidRequest, type Role, type SignedIn } from "@petitionu/domain"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { petitionVisible } from "./PetitionPolicy.ts"

/** The columns of a target user the policies look at. */
export interface PolicyUser {
  readonly id: string
  readonly role: Role
  readonly organizationId: string | null
}

const isCampusAdminOf = (actor: SignedIn, organizationId: string | null) =>
  actor.role === "admin" && organizationId !== null && organizationId === actor.organizationId

/**
 * Users the actor may read, as a filter on `users` aliased `alias`: themself, everyone for a
 * superadmin, and their own organization's users for an admin. Guests see nobody.
 */
export const visibleUsers = (sql: SqlClient.SqlClient, actor: Actor, alias: string) => {
  const user = sql(alias)
  if (actor._tag !== "SignedIn") return sql`FALSE`
  if (actor.role === "superadmin") return sql`TRUE`
  if (actor.role === "admin" && actor.organizationId !== null) {
    return sql`(${user}.id = ${actor.id} OR ${user}.organization_id = ${actor.organizationId})`
  }
  return sql`${user}.id = ${actor.id}`
}

/**
 * Field policy for email, role, graduation year, organization, email verified and profile
 * complete: the user themself, a superadmin, or an admin of the user's organization.
 */
export const canSeeDetails = (actor: Actor, user: PolicyUser) =>
  actor._tag === "SignedIn" &&
  (user.id === actor.id ||
    actor.role === "superadmin" ||
    isCampusAdminOf(actor, user.organizationId))

/** Field policy for petition and signature activity: only the user themself. */
export const canSeeActivity = (actor: Actor, user: PolicyUser) =>
  actor._tag === "SignedIn" && user.id === actor.id

/** Only a superadmin may grant the superadmin role. */
export const validateRequestedRole = (actor: SignedIn, role: Role) =>
  role === "superadmin" && actor.role !== "superadmin"
    ? Effect.fail(invalidRequest("only a superadmin can assign the superadmin role"))
    : Effect.void

/**
 * `set_role`: a superadmin may change anyone; an admin may change non-superadmins in their own
 * organization.
 */
export const authorizeSetRole = (actor: SignedIn, target: PolicyUser) =>
  actor.role === "superadmin" ||
  (target.role !== "superadmin" && isCampusAdminOf(actor, target.organizationId))
    ? Effect.void
    : Effect.fail(new Forbidden({ message: "You can't change this user's role." }))

/**
 * Petitions whose activity the actor may see, as a filter on `petition` aliased `alias`: not
 * hidden, and either public or in a classroom the actor teaches or is an active member of
 * (the petition read rule in `PetitionPolicy`).
 */
export const visiblePetitions = (sql: SqlClient.SqlClient, actor: SignedIn, alias: string) =>
  petitionVisible(sql, actor, alias)
