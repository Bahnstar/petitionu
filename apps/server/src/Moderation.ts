import {
  ContentReport,
  ContentReportState,
  CurrentUser,
  Invalid,
  ModerationRpcs,
  NotFound,
  type SignedIn,
} from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema, type Statement } from "effect/sql"
import { authorizeHide, authorizeResolve, visibleReports } from "./ModerationPolicy.ts"
import { requireParticipant } from "./Participant.ts"
import { invalidField, isUuid } from "./ParticipationPolicy.ts"
import { petitionVisible } from "./PetitionPolicy.ts"

const reportNotFound = new NotFound({ message: "Content report not found" })

const unavailable = invalidField("petitionId", "This content is unavailable.")

/** Trims `value`, blank becoming null, and checks it is at most 5000 characters. */
const details = (value: string | null | undefined) => {
  const trimmed = value?.trim() || null
  if (trimmed !== null && trimmed.length > 5000) {
    return Effect.fail(invalidField("details", "length must be less than or equal to 5000"))
  }
  return Effect.succeed(trimmed)
}

/** Trims the resolution note and checks it is 1 to 5000 characters. */
const resolutionNote = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.length < 1) {
    return Effect.fail(
      invalidField("resolutionNote", "length must be greater than or equal to 1"),
    )
  }
  if (trimmed.length > 5000) {
    return Effect.fail(invalidField("resolutionNote", "length must be less than or equal to 5000"))
  }
  return Effect.succeed(trimmed)
}

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
      to_char(r.inserted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS inserted_at,
      to_char(r.resolved_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS resolved_at
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

    const findTarget = (execute: (id: string) => Statement.Statement<object>) =>
      SqlSchema.findOneOption({ Request: Schema.String, Result: Target, execute })

    /** Ash's `ContentReport.Target`: the petition the user reports, if they can see it. */
    const petitionTarget = (user: SignedIn) =>
      findTarget(
        (id) => sql`
          SELECT p.id AS petition_id, p.title, p.description AS text, p.organization_id
          FROM petition p WHERE p.id = ${id} AND ${petitionVisible(sql, user, "p")}
        `,
      )

    const target = (user: SignedIn, petitionId: string | null) =>
      Effect.gen(function* () {
        if (petitionId === null || !isUuid(petitionId)) return yield* unavailable
        const found = yield* petitionTarget(user)(petitionId).pipe(Effect.orDie)
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

    /** Ash's `moderator_hide` on the reported petition, with its policy. */
    const hide = (actor: SignedIn, report: typeof LockedReport.Type) =>
      Effect.gen(function* () {
        const [petition] = yield* sql<{ organizationId: string | null }>`
          SELECT organization_id FROM petition WHERE id = ${report.petitionId} FOR UPDATE
        `
        yield* authorizeHide(actor, petition?.organizationId ?? null)
        yield* sql`
          UPDATE petition SET hidden_at = now() AT TIME ZONE 'utc',
            updated_at = now() AT TIME ZONE 'utc'
          WHERE id = ${report.petitionId}
        `
      })

    return ModerationRpcs.of({
      createContentReport: (input) =>
        Effect.gen(function* () {
          const user = yield* requireParticipant
          const text = yield* details(input.details)
          const found = yield* target(user, input.petitionId ?? null)
          const [row] = yield* sql<{ id: string }>`
            INSERT INTO content_reports (petition_id, comment_id, target_title, target_text,
              reason, details, organization_id, reporter_id)
            VALUES (${found.petitionId}, ${null}, ${found.title}, ${found.text},
              ${input.reason}, ${text}, ${found.organizationId}, ${user.id})
            RETURNING id
          `.pipe(Effect.orDie)
          return yield* findById(row!.id).pipe(Effect.orDie)
        }),
      getContentReports: ({ state }) =>
        Effect.flatMap(CurrentUser, (actor) =>
          list(actor, state === undefined ? sql`TRUE` : sql`r.state = ${state}`).pipe(Effect.orDie),
        ),
      resolveContentReport: ({ id, outcome, hideContent, resolutionNote: note }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser
          if (!isUuid(id)) return yield* reportNotFound
          const locked = yield* lockVisible(actor, id).pipe(Effect.orDie)
          if (Option.isNone(locked)) return yield* reportNotFound
          const text = yield* resolutionNote(note)
          yield* authorizeResolve(actor, locked.value)
          if (locked.value.state !== "open") {
            return yield* new Invalid({ message: "This report has already been reviewed.", fields: [] })
          }
          if (hideContent === true) {
            if (outcome === "dismissed") {
              return yield* new Invalid({
                message: "Dismissed reports cannot hide content.",
                fields: [],
              })
            }
            yield* hide(actor, locked.value)
          }
          yield* sql`
            UPDATE content_reports SET state = ${outcome}, resolution_note = ${text},
              resolver_id = ${actor.id}, resolved_at = now() AT TIME ZONE 'utc',
              updated_at = now() AT TIME ZONE 'utc'
            WHERE id = ${id}
          `
          return yield* findById(id).pipe(Effect.orDie)
        }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die)),
    })
  }),
)
