import {
  CurrentUser,
  invalidRequest,
  NotFound,
  type SignedIn,
  SupportRequest,
  SupportRpcs,
  SupportRequestState,
} from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema, type Statement } from "effect/sql"
import { AppConfig } from "./Config.ts"
import { maxListRows } from "./Database.ts"
import { authorizeResolve, visibleSupportRequests } from "./SupportPolicy.ts"

/** Used outside production when `SUPPORT_EMAIL` isn't set, as the Phoenix app did. */
const developmentSupportEmail = "support@localhost.test"

const requestNotFound = new NotFound({ message: "Support request not found" })

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
      r.inserted_at, r.resolved_at
    `

    const findById = SqlSchema.findOne({
      Request: Schema.String,
      Result: Schema.toType(SupportRequest),
      execute: (id) => sql`SELECT ${columns} FROM support_requests r WHERE r.id = ${id}`,
    })

    const list = (
      actor: SignedIn,
      filter: ReturnType<typeof visibleSupportRequests>,
      page: Statement.Fragment = sql``,
    ) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.toType(SupportRequest),
        execute: () => sql`
          SELECT ${columns} FROM support_requests r
          WHERE ${visibleSupportRequests(sql, actor, "r")} AND ${filter}
          ORDER BY r.inserted_at DESC, r.id DESC ${page}
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
          const [row] = yield* sql<{ id: string }>`
            INSERT INTO support_requests (kind, message, requester_email, user_id, organization_id)
            VALUES (${kind}, ${message}, ${actor.email}, ${actor.id}, ${actor.organizationId})
            RETURNING id
          `.pipe(Effect.orDie)
          return yield* findById(row!.id).pipe(Effect.orDie)
        }),
      getMySupportRequests: () =>
        Effect.flatMap(CurrentUser, (actor) =>
          list(actor, sql`r.user_id = ${actor.id}`, sql`LIMIT ${maxListRows}`).pipe(Effect.orDie),
        ),
      getSupportRequests: ({ state }) =>
        Effect.flatMap(CurrentUser, (actor) =>
          list(actor, state === undefined ? sql`TRUE` : sql`r.state = ${state}`).pipe(Effect.orDie),
        ),
      resolveSupportRequest: ({ id, resolutionNote }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser
          const locked = yield* lockVisible(actor, id).pipe(Effect.orDie)
          if (Option.isNone(locked)) return yield* requestNotFound
          yield* authorizeResolve(actor, locked.value)
          if (locked.value.state !== "open") {
            return yield* invalidRequest("This request has already been resolved.")
          }
          yield* sql`
            UPDATE support_requests SET state = 'resolved', resolution_note = ${resolutionNote},
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
