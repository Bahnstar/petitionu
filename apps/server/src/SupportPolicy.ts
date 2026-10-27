import { type Actor, Forbidden, type SignedIn } from "@petitionu/domain"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

const isOperatorFor = (actor: SignedIn, organizationId: string | null) =>
  actor.role === "superadmin" ||
  (actor.role === "admin" && organizationId !== null && organizationId === actor.organizationId)

/**
 * Support requests the actor may read, as a filter on `support_requests` aliased `alias`: their
 * own, every request for a superadmin, and their organization's requests for an admin.
 */
export const visibleSupportRequests = (sql: SqlClient.SqlClient, actor: Actor, alias: string) => {
  const request = sql(alias)
  if (actor._tag !== "SignedIn") return sql`FALSE`
  if (actor.role === "superadmin") return sql`TRUE`
  if (actor.role === "admin" && actor.organizationId !== null) {
    return sql`(${request}.user_id = ${actor.id} OR ${request}.organization_id = ${actor.organizationId})`
  }
  return sql`${request}.user_id = ${actor.id}`
}

/** Resolving: a superadmin, or an admin of the request's organization. */
export const authorizeResolve = (
  actor: SignedIn,
  request: { readonly organizationId: string | null },
) =>
  isOperatorFor(actor, request.organizationId)
    ? Effect.void
    : Effect.fail(new Forbidden({ message: "You can't resolve this request." }))
