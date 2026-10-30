import { type Actor, PetitionDto } from "@petitionu/domain"
import { Effect, Schema } from "effect"
import { type SqlClient, SqlSchema, type Statement } from "effect/sql"
import { petitionManageable, petitionVisible } from "./PetitionPolicy.ts"

const actorId = (actor: Actor) => (actor._tag === "SignedIn" ? actor.id : null)

/**
 * The petitions `actor` may see, as `PetitionDto`s (author anonymity, signature count,
 * trending, days left, has-signed and can-manage for the actor). `where`, `orderBy` and `limit`
 * refer to the petition aliased `p`. Shared by every area that returns petitions.
 */
export const selectPetitions = (
  sql: SqlClient.SqlClient,
  actor: Actor,
  where: Statement.Fragment,
  options: { readonly orderBy?: Statement.Fragment; readonly limit?: number } = {},
) => {
  const id = actorId(actor)
  const orderBy = options.orderBy ?? sql`p.inserted_at DESC, p.id DESC`
  return SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.toType(PetitionDto),
    execute: () => sql`
      SELECT p.id, p.title, p.description, coalesce(p.status, 'open') AS status,
        p.classroom_id, p.organization_id, p.category_id, p.goal::float8 AS goal,
        coalesce(p.allow_comments, true) AS allow_comments,
        coalesce(p.is_anonymous, false) AS is_anonymous,
        p.deadline,
        p.inserted_at,
        s.count AS signatures_count,
        EXISTS (SELECT 1 FROM signature hs WHERE hs.petition_id = p.id AND hs.user_id = ${id})
          AS has_signed,
        coalesce(${petitionManageable(sql, actor, "p")}, false) AS can_manage,
        CASE WHEN p.deadline IS NULL
          THEN 30 - EXTRACT(DAY FROM (now() AT TIME ZONE 'utc') - p.inserted_at)::int
          ELSE EXTRACT(DAY FROM p.deadline - (now() AT TIME ZONE 'utc'))::int
        END AS days_left,
        coalesce(s.count > 5 AND s.count::numeric / nullif(p.goal, 0) >= 0.5, false)
          AS trending,
        CASE
          WHEN coalesce(p.is_anonymous, false) THEN 'Anonymous student'
          WHEN u.id IS NULL THEN 'Student'
          ELSE concat_ws(' ', u.first_name, u.last_name)
        END AS author,
        CASE WHEN cat.id IS NULL THEN NULL
          ELSE json_build_object('id', cat.id, 'name', cat.name, 'color', cat.color)
        END AS category
      FROM petition p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN category cat ON cat.id = p.category_id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS count FROM signature WHERE petition_id = p.id
      ) s
      WHERE ${petitionVisible(sql, actor, "p")} AND ${where}
      ORDER BY ${orderBy}
      ${options.limit === undefined ? sql`` : sql`LIMIT ${options.limit}`}
    `,
  })(undefined).pipe(Effect.orDie)
}
