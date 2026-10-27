import {
  type Actor,
  CommentDto,
  CurrentUser,
  type Invalid,
  invalidField,
  ParticipationRpcs,
  SignatureDto,
  type SignedIn,
  UpdateDto,
} from "@petitionu/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema, type Statement } from "effect/sql"
import { requireParticipant } from "./Participant.ts"
import { checkInput, isUuid, text } from "./Input.ts"
import { checkPetition, type ParticipationKind } from "./ParticipationPolicy.ts"
import { petitionVisible } from "./PetitionPolicy.ts"

const insertedAt = (sql: SqlClient.SqlClient, alias: string) =>
  sql`to_char(${sql(alias)}.inserted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS inserted_at`

export const ParticipationHandlers = ParticipationRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    /** Rows of `table` aliased `t` on petitions `actor` may see, optionally one petition's. */
    const visibleRows = (
      actor: Actor,
      petitionId: string | null | undefined,
      extra: Statement.Fragment = sql`true`,
    ) => sql`
      EXISTS (SELECT 1 FROM petition p WHERE p.id = t.petition_id
        AND ${petitionVisible(sql, actor, "p")})
      AND ${petitionId ? sql`t.petition_id::text = ${petitionId}` : sql`true`}
      AND ${extra}
    `

    const selectSignatures = (where: Statement.Fragment) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: SignatureDto,
        execute: () => sql`
          SELECT t.id, t.petition_id, t.reason, coalesce(t.is_verified, false) AS is_verified,
            ${insertedAt(sql, "t")}
          FROM signature t WHERE ${where}
          ORDER BY t.inserted_at, t.id
        `,
      })(undefined).pipe(Effect.orDie)

    const selectComments = (where: Statement.Fragment) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: CommentDto,
        execute: () => sql`
          SELECT t.id, t.petition_id, t.parent_comment_id, t.text, ${insertedAt(sql, "t")},
            CASE WHEN u.id IS NULL THEN 'Student'
              ELSE concat_ws(' ', u.first_name, u.last_name) END AS author
          FROM comment t LEFT JOIN users u ON u.id = t.user_id
          WHERE ${where}
          ORDER BY t.inserted_at, t.id
        `,
      })(undefined).pipe(Effect.orDie)

    const selectUpdates = (where: Statement.Fragment, order: "oldest" | "newest" = "oldest") =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: UpdateDto,
        execute: () => sql`
          SELECT t.id, t.petition_id, t.title, t.body, ${insertedAt(sql, "t")}
          FROM update t WHERE ${where}
          ORDER BY ${
            order === "newest" ? sql`t.inserted_at DESC, t.id DESC` : sql`t.inserted_at, t.id`
          }
        `,
      })(undefined).pipe(Effect.orDie)

    /**
     * Runs `write` for a participant in a transaction, after locking and checking the petition.
     * `validate` runs first, so bad input is reported before the petition is looked at.
     */
    const participate = <I, A, E>(
      kind: ParticipationKind,
      petitionId: string,
      validate: Effect.Effect<I, Invalid>,
      write: (user: SignedIn, input: I) => Effect.Effect<A, E>,
    ) =>
      Effect.gen(function* () {
        const user = yield* requireParticipant
        const input = yield* validate
        yield* checkPetition(sql, user, petitionId, kind)
        return yield* write(user, input)
      }).pipe(sql.withTransaction)

    /** The one row a write just inserted, read back as its DTO. */
    const single = <A>(rows: ReadonlyArray<A>) => Effect.succeed(rows[0]!)

    return ParticipationRpcs.of({
      createSignature: ({ petitionId, reason }) =>
        participate(
          "signature",
          petitionId,
          checkInput({ reason: text("reason", reason, { maxLength: 2000 }) }),
          (user, input) =>
            Effect.gen(function* () {
              const [row] = yield* sql<{ id: string }>`
                INSERT INTO signature (petition_id, user_id, reason, is_verified)
                VALUES (${petitionId}, ${user.id}, ${input.reason}, true)
                RETURNING id
              `
              return yield* Effect.flatMap(selectSignatures(sql`t.id = ${row!.id}`), single)
            }),
        ).pipe(
          Effect.catchTag("SqlError", (error) =>
            error.reason._tag === "UniqueViolation"
              ? Effect.fail(invalidField("petitionId", "has already been taken"))
              : Effect.die(error),
          ),
        ),
      getSignatures: ({ petitionId }) =>
        Effect.flatMap(CurrentUser, (user) => selectSignatures(visibleRows(user, petitionId))),
      createComment: ({ petitionId, text: raw, parentCommentId }) =>
        participate(
          "comment",
          petitionId,
          checkInput({ text: text("text", raw, { maxLength: 5000, required: "must be present" }) }),
          (user, input) =>
            Effect.gen(function* () {
              const parent = parentCommentId ?? null
              if (parent !== null) {
                // Ash's `CommentParent`: the parent must be a comment the user can read on
                // the same petition.
                const found = isUuid(parent)
                  ? yield* selectComments(
                      sql`t.id = ${parent} AND ${visibleRows(user, petitionId, sql`t.hidden_at IS NULL`)}`,
                    )
                  : []
                if (found.length === 0) {
                  return yield* invalidField(
                    "parentCommentId",
                    "Reply to a comment in this petition.",
                  )
                }
              }
              const [row] = yield* sql<{ id: string }>`
                INSERT INTO comment (petition_id, user_id, text, parent_comment_id)
                VALUES (${petitionId}, ${user.id}, ${input.text}, ${parent})
                RETURNING id
              `
              return yield* Effect.flatMap(selectComments(sql`t.id = ${row!.id}`), single)
            }),
        ).pipe(Effect.catchTag("SqlError", Effect.die)),
      getComments: ({ petitionId }) =>
        Effect.flatMap(CurrentUser, (user) =>
          selectComments(visibleRows(user, petitionId, sql`t.hidden_at IS NULL`)),
        ),
      createUpdate: ({ petitionId, title, body }) =>
        participate(
          "update",
          petitionId,
          checkInput({
            title: text("title", title, { maxLength: 200, required: "is required" }),
            body: text("body", body, { maxLength: 20000, required: "is required" }),
          }),
          (_user, input) =>
            Effect.gen(function* () {
              const [row] = yield* sql<{ id: string }>`
                INSERT INTO update (petition_id, title, body)
                VALUES (${petitionId}, ${input.title}, ${input.body})
                RETURNING id
              `
              return yield* Effect.flatMap(selectUpdates(sql`t.id = ${row!.id}`), single)
            }),
        ).pipe(Effect.catchTag("SqlError", Effect.die)),
      getUpdates: ({ petitionId }) =>
        Effect.flatMap(CurrentUser, (user) => selectUpdates(visibleRows(user, petitionId))),
      getUpdatesForPetition: ({ petitionId }) =>
        Effect.flatMap(CurrentUser, (user) =>
          selectUpdates(visibleRows(user, petitionId), "newest"),
        ),
    })
  }),
)
