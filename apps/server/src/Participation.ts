import {
  type Actor,
  CommentDto,
  CurrentUser,
  invalidField,
  ParticipationRpcs,
  SignatureDto,
  type SignedIn,
  UpdateDto,
} from "@petitionu/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema, type Statement } from "effect/sql"
import { checkCommentWrite, commentEditable, commentVisible } from "./CommentPolicy.ts"
import { requireParticipant } from "./Participant.ts"
import { checkPetition, type ParticipationKind } from "./ParticipationPolicy.ts"
import { petitionVisible } from "./PetitionPolicy.ts"
import { isoTimestamp } from "./Timestamps.ts"

const insertedAt = (sql: SqlClient.SqlClient, alias: string) =>
  sql`${isoTimestamp(sql, `${alias}.inserted_at`)} AS inserted_at`

export const ParticipationHandlers = ParticipationRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    /** Rows of `t` on one petition, or on any when `petitionId` is missing. */
    const onePetition = (petitionId: string | null | undefined) =>
      petitionId ? sql`t.petition_id = ${petitionId}` : sql`true`

    /** Rows of `table` aliased `t` on petitions `actor` may see, optionally one petition's. */
    const visibleRows = (actor: Actor, petitionId: string | null | undefined) => sql`
      EXISTS (SELECT 1 FROM petition p WHERE p.id = t.petition_id
        AND ${petitionVisible(sql, actor, "p")})
      AND ${onePetition(petitionId)}
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

    const selectComments = (actor: SignedIn, where: Statement.Fragment) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: CommentDto,
        execute: () => sql`
          SELECT t.id, t.petition_id, t.parent_comment_id, t.text, ${insertedAt(sql, "t")},
            CASE WHEN u.id IS NULL THEN 'Student'
              ELSE concat_ws(' ', u.first_name, u.last_name) END AS author,
            ${commentEditable(sql, actor, "t")} AS can_edit
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

    /** Runs `write` for a participant in a transaction, after locking and checking the petition. */
    const participate = <A, E>(
      kind: ParticipationKind,
      petitionId: string,
      write: (user: SignedIn) => Effect.Effect<A, E>,
    ) =>
      Effect.gen(function* () {
        const user = yield* requireParticipant
        yield* checkPetition(sql, user, petitionId, kind)
        return yield* write(user)
      }).pipe(sql.withTransaction)

    /** The one row a write just inserted, read back as its DTO. */
    const single = <A>(rows: ReadonlyArray<A>) => Effect.succeed(rows[0]!)

    return ParticipationRpcs.of({
      createSignature: ({ petitionId, reason }) =>
        participate("signature", petitionId, (user) =>
          Effect.gen(function* () {
            const [row] = yield* sql<{ id: string }>`
              INSERT INTO signature (petition_id, user_id, reason, is_verified)
              VALUES (${petitionId}, ${user.id}, ${reason ?? null}, true)
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
      deleteSignature: ({ petitionId }) =>
        participate("withdrawal", petitionId, (user) =>
          Effect.gen(function* () {
            const deleted = yield* sql`
              DELETE FROM signature WHERE petition_id = ${petitionId} AND user_id = ${user.id}
              RETURNING id
            `
            if (deleted.length === 0) {
              return yield* invalidField("petitionId", "You haven't signed this petition.")
            }
          }),
        ).pipe(Effect.catchTag("SqlError", Effect.die)),
      getSignatures: ({ petitionId }) =>
        Effect.flatMap(CurrentUser, (user) => selectSignatures(visibleRows(user, petitionId))),
      createComment: ({ petitionId, text, parentCommentId }) =>
        participate("comment", petitionId, (user) =>
          Effect.gen(function* () {
            const parent = parentCommentId ?? null
            if (parent !== null) {
              // Ash's `CommentParent`: the parent must be a comment the user can read on
              // the same petition.
              const found = yield* selectComments(
                user,
                sql`t.id = ${parent} AND t.petition_id = ${petitionId}
                    AND ${commentVisible(sql, user, "t")}`,
              )
              if (found.length === 0) {
                return yield* invalidField(
                  "parentCommentId",
                  "Reply to a comment in this petition.",
                )
              }
            }
            const [row] = yield* sql<{ id: string }>`
                INSERT INTO comment (petition_id, user_id, text, parent_comment_id)
                VALUES (${petitionId}, ${user.id}, ${text}, ${parent})
                RETURNING id
              `
            return yield* Effect.flatMap(selectComments(user, sql`t.id = ${row!.id}`), single)
          }),
        ).pipe(Effect.catchTag("SqlError", Effect.die)),
      updateComment: ({ id, text }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* checkCommentWrite(sql, user, id)
          yield* sql`
            UPDATE comment SET text = ${text}, updated_at = now() AT TIME ZONE 'utc'
            WHERE id = ${id}
          `
          return yield* Effect.flatMap(selectComments(user, sql`t.id = ${id}`), single)
        }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die)),
      deleteComment: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* checkCommentWrite(sql, user, id)
          yield* sql`
            UPDATE comment SET text = NULL, deleted_at = now() AT TIME ZONE 'utc',
              updated_at = now() AT TIME ZONE 'utc'
            WHERE id = ${id}
          `
        }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die)),
      getComments: ({ petitionId }) =>
        Effect.flatMap(CurrentUser, (user) =>
          selectComments(
            user,
            sql`${onePetition(petitionId)} AND ${commentVisible(sql, user, "t")}`,
          ),
        ),
      createUpdate: ({ petitionId, title, body }) =>
        participate("update", petitionId, () =>
          Effect.gen(function* () {
            const [row] = yield* sql<{ id: string }>`
              INSERT INTO update (petition_id, title, body)
              VALUES (${petitionId}, ${title}, ${body})
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
