import { type Actor, Forbidden, type SignedIn } from "@petitionu/domain"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/** A superadmin, or an admin of `organizationId` (campus-less content is for superadmins). */
const moderates = (actor: SignedIn, organizationId: string | null) =>
  actor.role === "superadmin" ||
  (actor.role === "admin" && organizationId !== null && organizationId === actor.organizationId)

/**
 * Reports the actor may read, as a filter on `content_reports` aliased `alias`: their own,
 * every report for a superadmin, and their organization's reports for an admin.
 */
export const visibleReports = (sql: SqlClient.SqlClient, actor: Actor, alias: string) => {
  const report = sql(alias)
  if (actor._tag !== "SignedIn") return sql`FALSE`
  if (actor.role === "superadmin") return sql`TRUE`
  if (actor.role === "admin" && actor.organizationId !== null) {
    return sql`(${report}.reporter_id = ${actor.id} OR ${report}.organization_id = ${actor.organizationId})`
  }
  return sql`${report}.reporter_id = ${actor.id}`
}

/** Resolving: a superadmin, or an admin of the report's organization. */
export const authorizeResolve = (
  actor: SignedIn,
  report: { readonly organizationId: string | null },
) =>
  moderates(actor, report.organizationId)
    ? Effect.void
    : Effect.fail(new Forbidden({ message: "You can't resolve this report." }))

/**
 * Ash's `moderator_hide` policy on petitions and comments: a superadmin, or an admin of the
 * organization of the content's petition.
 */
export const authorizeHide = (actor: SignedIn, petitionOrganizationId: string | null) =>
  moderates(actor, petitionOrganizationId)
    ? Effect.void
    : Effect.fail(new Forbidden({ message: "You can't hide this content." }))
