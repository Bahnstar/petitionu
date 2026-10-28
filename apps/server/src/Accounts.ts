import { AccountsRpcs, CurrentActor, MeDto, NotFound } from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { isoTimestamp } from "./Timestamps.ts"

export const MeRow = Schema.Struct({
  ...MeDto.fields,
  organization: Schema.NullOr(
    Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String) }),
  ),
})

/** The signed-in user's own account, as `getMe` returns it. */
export const findMeQuery = (sql: SqlClient.SqlClient) =>
  SqlSchema.findOneOption({
    Request: Schema.String,
    Result: MeRow,
    execute: (id) => sql`
      SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.role,
        ${isoTimestamp(sql, "u.inserted_at")} AS inserted_at,
        u.graduation_year::int AS graduation_year,
        u.confirmed_at IS NOT NULL AS email_verified,
        (u.confirmed_at IS NOT NULL AND u.organization_id IS NOT NULL
          AND coalesce(u.first_name, '') <> '' AND coalesce(u.last_name, '') <> '')
          AS profile_complete,
        u.organization_id,
        CASE WHEN o.id IS NULL THEN NULL ELSE json_build_object('id', o.id, 'name', o.name) END
          AS organization,
        EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id
          AND a.provider_id = 'credential' AND a.password IS NOT NULL) AS has_password
      FROM users u LEFT JOIN organization o ON o.id = u.organization_id
      WHERE u.id = ${id}
    `,
  })

const notFound = new NotFound({ message: "User not found" })

export const AccountsHandlers = AccountsRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const findMe = findMeQuery(sql)

    return AccountsRpcs.of({
      getMe: () =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor
          if (actor._tag !== "SignedIn") return yield* notFound
          const me = yield* findMe(actor.id).pipe(Effect.orDie)
          return yield* Option.match(me, {
            onNone: () => Effect.fail(notFound),
            onSome: Effect.succeed,
          })
        }),
    })
  }),
)
