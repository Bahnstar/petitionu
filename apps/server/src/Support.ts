import {
  CurrentUser,
  invalidField,
  invalidRequest,
  NotFound,
  type SignedIn,
  SupportRequest,
  SupportRpcs,
  SupportRequestState,
} from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { AppConfig } from "./Config.ts"
import { authorizeResolve, visibleSupportRequests } from "./SupportPolicy.ts"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Used outside production when `SUPPORT_EMAIL` isn't set, as the Phoenix app did. */
const developmentSupportEmail = "support@localhost.test"

const requestNotFound = new NotFound({ message: "Support request not found" })

/** Trims `value` and checks it is 1 to 5000 characters, or fails `Invalid` for `field`. */
const note = (field: string, value: string) => {
  const trimmed = value.trim()
  const invalid = (message: string) => Effect.fail(invalidField(field, message))
  if (trimmed.length < 1) return invalid("length must be greater than or equal to 1")
  if (trimmed.length > 5000) return invalid("length must be less than or equal to 5000")
  return Effect.succeed(trimmed)
}

const LockedRequest = Schema.Struct({
  organizationId: Schema.NullOr(Schema.String),
  state: SupportRequestState,
})

export const SupportHandlers = SupportRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const config = yield* AppConfig

    const columns = sql`
      r.id, r.kind, r.requester_email::text AS requester_email, r.message, r.state,
      r.resolution_note,
      to_char(r.inserted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS inserted_at,
      to_char(r.resolved_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS resolved_at
    `

    const findById = SqlSchema.findOne({
      Request: Schema.String,
      Result: SupportRequest,
      execute: (id) => sql`SELECT ${columns} FROM support_requests r WHERE r.id = ${id}`,
    })

    const list = (actor: SignedIn, filter: ReturnType<typeof visibleSupportRequests>) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: SupportRequest,
        execute: () => sql`
          SELECT ${columns} FROM support_requests r
          WHERE ${visibleSupportRequests(sql, actor, "r")} AND ${filter}
          ORDER BY r.inserted_at DESC, r.id DESC
        `,
      })(undefined)

    const lockVisible = (actor: SignedIn, id: string) =>
      SqlSchema.findOneOption({
        Request: Schema.String,
        Result: LockedRequest,
        execute: (requestId) => sql`
          SELECT r.organization_id, r.state FROM support_requests r
          WHERE r.id = ${requestId} AND ${visibleSupportRequests(sql, actor, "r")}
          FOR UPDATE OF r
        `,
      })(id)

    return SupportRpcs.of({
      createSupportRequest: ({ kind, message }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser
          const text = yield* note("message", message)
          const [row] = yield* sql<{ id: string }>`
            INSERT INTO support_requests (kind, message, requester_email, user_id, organization_id)
            VALUES (${kind}, ${text}, ${actor.email}, ${actor.id}, ${actor.organizationId})
            RETURNING id
          `.pipe(Effect.orDie)
          return yield* findById(row!.id).pipe(Effect.orDie)
        }),
      getMySupportRequests: () =>
        Effect.flatMap(CurrentUser, (actor) =>
          list(actor, sql`r.user_id = ${actor.id}`).pipe(Effect.orDie),
        ),
      getSupportRequests: ({ state }) =>
        Effect.flatMap(CurrentUser, (actor) =>
          list(actor, state === undefined ? sql`TRUE` : sql`r.state = ${state}`).pipe(Effect.orDie),
        ),
      resolveSupportRequest: ({ id, resolutionNote }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser
          if (!uuidPattern.test(id)) return yield* requestNotFound
          const locked = yield* lockVisible(actor, id).pipe(Effect.orDie)
          if (Option.isNone(locked)) return yield* requestNotFound
          const text = yield* note("resolutionNote", resolutionNote)
          yield* authorizeResolve(actor, locked.value)
          if (locked.value.state !== "open") {
            return yield* invalidRequest("This request has already been resolved.")
          }
          yield* sql`
            UPDATE support_requests SET state = 'resolved', resolution_note = ${text},
              resolver_id = ${actor.id}, resolved_at = now() AT TIME ZONE 'utc',
              updated_at = now() AT TIME ZONE 'utc'
            WHERE id = ${id}
          `.pipe(Effect.orDie)
          return yield* findById(id).pipe(Effect.orDie)
        }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die)),
      supportContact: () =>
        Effect.succeed(Option.getOrElse(config.supportEmail, () => developmentSupportEmail)),
    })
  }),
)
