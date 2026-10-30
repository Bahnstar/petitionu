import {
  ContentReport,
  ContentReportState,
  CurrentUser,
  invalidField,
  invalidRequest,
  isUuid,
  ModerationRpcs,
  NotFound,
  type SignedIn,
} from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema, type Statement } from "effect/sql"
import { authorizeHide, authorizeResolve, visibleReports } from "./ModerationPolicy.ts"
import { requireParticipant } from "./Participant.ts"
import { commentVisible } from "./CommentPolicy.ts"
import { petitionVisible } from "./PetitionPolicy.ts"
import { isoTimestamp } from "./Timestamps.ts"

const reportNotFound = new NotFound({ message: "Content report not found" })

const unavailable = invalidField("petitionId", "This content is unavailable.")

const LockedReport = Schema.Struct({
  organizationId: Schema.NullOr(Schema.String),
  state: ContentReportState,
  petitionId: Schema.String,
  commentId: Schema.NullOr(Schema.String),
})

/** What a report points at: its petition, the reported text, and the petition's campus. */
const Target = Schema.Struct({
  petitionId: Schema.String,
  title: Schema.String,
  text: Schema.String,
  organizationId: Schema.NullOr(Schema.String),
})

export const ModerationHandlers = ModerationRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const columns = sql`
      r.id, r.petition_id, r.comment_id, r.target_title, r.target_text, r.reason, r.details,
      r.state, r.resolution_note,
      ${isoTimestamp(sql, "r.inserted_at")} AS inserted_at,
      ${isoTimestamp(sql, "r.resolved_at")} AS resolved_at
    `

    const findById = SqlSchema.findOne({
      Request: Schema.String,
      Result: ContentReport,
      execute: (id) => sql`SELECT ${columns} FROM content_reports r WHERE r.id = ${id}`,
    })

    const list = (actor: SignedIn, filter: Statement.Fragment) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: ContentReport,
        execute: () => sql`
          SELECT ${columns} FROM content_reports r
          WHERE ${visibleReports(sql, actor, "r")} AND ${filter}
          ORDER BY r.inserted_at DESC, r.id DESC
        `,
      })(undefined)

    const findTarget = (execute: (id: string) => Statement.Statement<object>) => (id: string) =>
      SqlSchema.findOneOption({ Request: Schema.String, Result: Target, execute })(id).pipe(
        Effect.orDie,
      )

    /**
     * Ash's `ContentReport.Target`: the comment the user reports, if they can read it, or else
     * the petition. A comment report always targets the comment's own petition.
     */
    const target = (user: SignedIn, petitionId: string | null, commentId: string | null) =>
      Effect.gen(function* () {
        const id = commentId ?? petitionId
        if (id === null || !isUuid(id)) return yield* unavailable
        const visible = petitionVisible(sql, user, "p")
        const found = yield* commentId === null
          ? findTarget(
              (petition) => sql`
                SELECT p.id AS petition_id, p.title, p.description AS text, p.organization_id
                FROM petition p WHERE p.id = ${petition} AND ${visible}
              `,
            )(id)
          : findTarget(
              (comment) => sql`
                SELECT p.id AS petition_id, p.title, coalesce(c.text, p.description) AS text,
                  p.organization_id
                FROM comment c JOIN petition p ON p.id = c.petition_id
                WHERE c.id = ${comment} AND ${commentVisible(sql, user, "c")}
              `,
            )(id)
        if (Option.isNone(found)) return yield* unavailable
        return found.value
      })

    const lockVisible = (actor: SignedIn, id: string) =>
      SqlSchema.findOneOption({
        Request: Schema.String,
        Result: LockedReport,
        execute: (reportId) => sql`
          SELECT r.organization_id, r.state, r.petition_id, r.comment_id FROM content_reports r
          WHERE r.id = ${reportId} AND ${visibleReports(sql, actor, "r")}
          FOR UPDATE OF r
        `,
      })(id)

    /**
     * Ash's `moderator_hide` on the reported comment, or else the petition, under its policy:
     * the moderator must moderate the campus of the content's petition.
     */
    const hide = (actor: SignedIn, report: typeof LockedReport.Type) =>
      Effect.gen(function* () {
        const [petition] = yield* sql<{ organizationId: string | null }>`
          SELECT organization_id FROM petition WHERE id = ${report.petitionId} FOR UPDATE
        `
        yield* authorizeHide(actor, petition?.organizationId ?? null)
        const table = report.commentId === null ? "petition" : "comment"
        yield* sql`
          UPDATE ${sql(table)} SET hidden_at = now() AT TIME ZONE 'utc',
            updated_at = now() AT TIME ZONE 'utc'
          WHERE id = ${report.commentId ?? report.petitionId}
        `
      })

    return ModerationRpcs.of({
      createContentReport: (input) =>
        Effect.gen(function* () {
          const user = yield* requireParticipant
          const commentId = input.commentId ?? null
          const found = yield* target(user, input.petitionId ?? null, commentId)
          const [row] = yield* sql<{ id: string }>`
            INSERT INTO content_reports (petition_id, comment_id, target_title, target_text,
              reason, details, organization_id, reporter_id)
            VALUES (${found.petitionId}, ${commentId}, ${found.title}, ${found.text},
              ${input.reason}, ${input.details ?? null}, ${found.organizationId}, ${user.id})
            RETURNING id
          `.pipe(Effect.orDie)
          return yield* findById(row!.id).pipe(Effect.orDie)
        }),
      getContentReports: ({ state }) =>
        Effect.flatMap(CurrentUser, (actor) =>
          list(actor, state === undefined ? sql`TRUE` : sql`r.state = ${state}`).pipe(Effect.orDie),
        ),
      resolveContentReport: ({ id, outcome, hideContent, resolutionNote }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser
          const locked = yield* lockVisible(actor, id).pipe(Effect.orDie)
          if (Option.isNone(locked)) return yield* reportNotFound
          yield* authorizeResolve(actor, locked.value)
          if (locked.value.state !== "open") {
            return yield* invalidRequest("This report has already been reviewed.")
          }
          if (hideContent === true) {
            if (outcome === "dismissed") {
              return yield* invalidRequest("Dismissed reports cannot hide content.")
            }
            yield* hide(actor, locked.value)
          }
          yield* sql`
            UPDATE content_reports SET state = ${outcome}, resolution_note = ${resolutionNote},
              resolver_id = ${actor.id}, resolved_at = now() AT TIME ZONE 'utc',
              updated_at = now() AT TIME ZONE 'utc'
            WHERE id = ${id}
          `
          return yield* findById(id).pipe(Effect.orDie)
        }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die)),
    })
  }),
)
