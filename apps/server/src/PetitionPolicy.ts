import type { Actor } from "@petitionu/domain"
import type { SqlClient } from "effect/sql"

const actorId = (actor: Actor) => (actor._tag === "SignedIn" ? actor.id : null)

/**
 * Read scoping for petitions (Ash's petition read policy): a SQL condition on the petition row
 * aliased `petition` that holds when `actor` may see it. A petition is visible when it isn't
 * hidden and is either outside any classroom, or in a classroom the actor teaches or is an
 * active member of. Comments, signatures and updates are visible exactly when their petition is.
 *
 * `sql\`SELECT ... FROM petition p WHERE ${petitionVisible(sql, actor, "p")}\``
 */
export const petitionVisible = (sql: SqlClient.SqlClient, actor: Actor, petition = "petition") => {
  const p = sql(petition)
  const id = actorId(actor)
  if (id === null) return sql`(${p}.hidden_at IS NULL AND ${p}.classroom_id IS NULL)`
  return sql`(${p}.hidden_at IS NULL AND (${p}.classroom_id IS NULL
    OR EXISTS (SELECT 1 FROM classrooms pv_c WHERE pv_c.id = ${p}.classroom_id
      AND pv_c.professor_id = ${id})
    OR EXISTS (SELECT 1 FROM classroom_memberships pv_m WHERE pv_m.classroom_id = ${p}.classroom_id
      AND pv_m.user_id = ${id} AND pv_m.status = 'active')))`
}

/**
 * `can_manage`: the actor wrote the petition, or teaches its classroom, and it isn't hidden.
 * Managing (edit, close, victory, publishing updates) also needs the petition to be visible.
 */
export const petitionManageable = (
  sql: SqlClient.SqlClient,
  actor: Actor,
  petition = "petition",
) => {
  const p = sql(petition)
  const id = actorId(actor)
  if (id === null) return sql`false`
  return sql`(${p}.hidden_at IS NULL AND (${p}.user_id = ${id}
    OR EXISTS (SELECT 1 FROM classrooms pm_c WHERE pm_c.id = ${p}.classroom_id
      AND pm_c.professor_id = ${id})))`
}
