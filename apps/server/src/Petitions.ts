import {
  type Actor,
  CurrentActor,
  CurrentUser,
  Forbidden,
  Invalid,
  NotFound,
  PetitionCommentDto,
  PetitionDto,
  type PetitionInput,
  PetitionRpcs,
  PetitionSignatureDto,
  PetitionUpdateDto,
  type SignedIn,
  CategoryDto,
  type FieldError,
  validatePetitionInput,
} from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema, type Statement } from "effect/sql"
import { requireParticipant } from "./Participant.ts"
import { petitionManageable, petitionVisible } from "./PetitionPolicy.ts"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (value: string) => uuidPattern.test(value)

const petitionNotFound = new NotFound({ message: "Petition not found" })

const invalid = (fields: ReadonlyArray<FieldError>) =>
  new Invalid({ message: fields[0]?.message ?? "is invalid", fields })

const actorId = (actor: Actor) => (actor._tag === "SignedIn" ? actor.id : null)

export const PetitionsHandlers = PetitionRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    /** The petition DTO columns for `actor`; `where` and `orderBy` refer to `p`. */
    const selectPetitions = (
      actor: Actor,
      where: Statement.Fragment,
      orderBy: Statement.Fragment = sql`p.inserted_at DESC, p.id`,
    ) => {
      const id = actorId(actor)
      return SqlSchema.findAll({
        Request: Schema.Void,
        Result: PetitionDto,
        execute: () => sql`
          SELECT p.id, p.title, p.description, coalesce(p.status, 'open') AS status,
            p.classroom_id, p.organization_id, p.category_id, p.goal::float8 AS goal,
            coalesce(p.allow_comments, true) AS allow_comments,
            coalesce(p.is_anonymous, false) AS is_anonymous,
            to_char(p.deadline, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deadline,
            to_char(p.inserted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS inserted_at,
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
        `,
      })(undefined).pipe(Effect.orDie)
    }

    const findPetition = (actor: Actor, id: string) =>
      isUuid(id)
        ? Effect.map(selectPetitions(actor, sql`p.id = ${id}`), (rows) => Option.fromNullishOr(rows[0]))
        : Effect.succeed(Option.none<PetitionDto>())

    const getPetition = (actor: Actor, id: string) =>
      Effect.flatMap(findPetition(actor, id), (petition) =>
        Option.isSome(petition) ? Effect.succeed(petition.value) : Effect.fail(petitionNotFound),
      )

    const comments = SqlSchema.findAll({
      Request: Schema.String,
      Result: PetitionCommentDto,
      execute: (petitionId) => sql`
        SELECT c.id, c.text,
          to_char(c.inserted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS inserted_at,
          CASE WHEN u.id IS NULL THEN 'Student' ELSE concat_ws(' ', u.first_name, u.last_name) END
            AS author
        FROM comment c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.petition_id = ${petitionId} AND c.hidden_at IS NULL
        ORDER BY c.inserted_at, c.id
      `,
    })
    const signatures = SqlSchema.findAll({
      Request: Schema.String,
      Result: PetitionSignatureDto,
      execute: (petitionId) => sql`
        SELECT id, reason, to_char(inserted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS inserted_at
        FROM signature WHERE petition_id = ${petitionId}
        ORDER BY inserted_at, id
      `,
    })
    const updates = SqlSchema.findAll({
      Request: Schema.String,
      Result: PetitionUpdateDto,
      execute: (petitionId) => sql`
        SELECT id, title, body,
          to_char(inserted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS inserted_at
        FROM update WHERE petition_id = ${petitionId}
        ORDER BY inserted_at, id
      `,
    })

    const categories = SqlSchema.findAll({
      Request: Schema.Void,
      Result: CategoryDto,
      execute: () => sql`SELECT id, name, description, color FROM category ORDER BY name, id`,
    })

    const categoryExists = (id: string) =>
      isUuid(id)
        ? Effect.map(sql`SELECT 1 FROM category WHERE id = ${id}`, (rows) => rows.length > 0)
        : Effect.succeed(false)

    /**
     * Ash's `PetitionCampus`: a campus petition takes the author's organization; a classroom
     * petition needs a classroom the author can see that isn't archived, and takes its
     * organization (or the author's).
     */
    const petitionCampus = (user: SignedIn, classroomId: string | null) =>
      Effect.gen(function* () {
        if (classroomId === null) return user.organizationId
        const unavailable = invalid([
          { field: "classroomId", message: "This classroom is unavailable." },
        ])
        if (!isUuid(classroomId)) return yield* unavailable
        const [classroom] = yield* sql<{
          professorId: string
          organizationId: string | null
          archived: boolean
          allowStudentPetitions: boolean
        }>`
          SELECT c.professor_id, c.organization_id, c.archived, c.allow_student_petitions
          FROM classrooms c
          WHERE c.id = ${classroomId} AND (c.professor_id = ${user.id} OR EXISTS (
            SELECT 1 FROM classroom_memberships m WHERE m.classroom_id = c.id
              AND m.user_id = ${user.id} AND m.status = 'active'))
        `.pipe(Effect.orDie)
        if (!classroom || classroom.archived) return yield* unavailable
        if (classroom.professorId !== user.id && !classroom.allowStudentPetitions) {
          return yield* invalid([
            {
              field: "classroomId",
              message: "Only the professor can create petitions in this classroom.",
            },
          ])
        }
        return classroom.organizationId ?? user.organizationId
      })

    const create = (
      input: PetitionInput & { readonly categoryId: string },
      classroomId: string | null,
    ) =>
      Effect.gen(function* () {
        const user = yield* requireParticipant
        const checked = validatePetitionInput(input, { mode: "create", now: new Date() })
        if (!checked.ok) return yield* invalid(checked.errors)
        if (!(yield* categoryExists(input.categoryId).pipe(Effect.orDie))) {
          return yield* invalid([{ field: "categoryId", message: "is invalid" }])
        }
        const organizationId = yield* petitionCampus(user, classroomId)
        const { value } = checked
        const [row] = yield* sql<{ id: string }>`
          INSERT INTO petition ${sql.insert({
            title: value.title ?? null,
            description: value.description ?? null,
            goal: value.goal ?? 1000,
            deadline: value.deadline ?? null,
            allowComments: value.allowComments ?? true,
            isAnonymous: value.isAnonymous ?? false,
            categoryId: input.categoryId,
            classroomId,
            organizationId,
            userId: user.id,
          })}
          RETURNING id
        `.pipe(Effect.orDie)
        return yield* getPetition(user, row!.id).pipe(Effect.orDie)
      })

    /**
     * Loads a petition the user may manage, locking it: `NotFound` unless the user can see it,
     * `Forbidden` unless they wrote it or teach its classroom.
     */
    const manage = <A, E, R>(
      id: string,
      change: (user: SignedIn) => Effect.Effect<A, E, R>,
    ) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        if (!isUuid(id)) return yield* petitionNotFound
        const [row] = yield* sql<{ canManage: boolean }>`
          SELECT ${petitionManageable(sql, user, "p")} AS can_manage
          FROM petition p
          WHERE p.id = ${id} AND ${petitionVisible(sql, user, "p")}
          FOR UPDATE OF p
        `.pipe(Effect.orDie)
        if (!row) return yield* petitionNotFound
        if (!row.canManage) {
          return yield* new Forbidden({ message: "You can't manage this petition." })
        }
        yield* change(user)
        return yield* getPetition(user, id).pipe(Effect.orDie)
      }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die))

    const setStatus = (id: string, status: "closed" | "victory") =>
      manage(id, () =>
        sql`
          UPDATE petition SET status = ${status}, updated_at = now() AT TIME ZONE 'utc'
          WHERE id = ${id}
        `.pipe(Effect.orDie),
      )

    return PetitionRpcs.of({
      getCategories: () => categories(undefined).pipe(Effect.orDie),
      getPetitions: ({ organizationId }) =>
        Effect.flatMap(CurrentUser, (user) =>
          selectPetitions(
            user,
            organizationId ? sql`p.organization_id::text = ${organizationId}` : sql`true`,
          ),
        ),
      getPublicPetitions: () =>
        Effect.flatMap(CurrentUser, (user) => selectPetitions(user, sql`p.classroom_id IS NULL`)),
      getClassroomPetitions: ({ classroomId, sort }) =>
        Effect.flatMap(CurrentUser, (user) =>
          selectPetitions(
            user,
            sql`p.classroom_id::text = ${classroomId}`,
            sort === "goal" ? sql`p.goal DESC NULLS LAST, p.id` : sql`p.inserted_at DESC, p.id`,
          ),
        ),
      getPetitionById: ({ id }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor
          const petition = yield* getPetition(actor, id)
          if (actor._tag !== "SignedIn") {
            const { categoryId: _, category, ...shared } = petition
            return {
              ...shared,
              category: category === null ? null : { id: category.id, name: category.name },
            }
          }
          return {
            ...petition,
            comments: yield* comments(petition.id).pipe(Effect.orDie),
            signatures: yield* signatures(petition.id).pipe(Effect.orDie),
            updates: yield* updates(petition.id).pipe(Effect.orDie),
          }
        }),
      createPetition: ({ categoryId, ...input }) => create({ ...input, categoryId }, null),
      createClassroomPetition: ({ categoryId, classroomId, ...input }) =>
        create({ ...input, categoryId }, classroomId),
      updatePetition: ({ id, ...input }) =>
        manage(id, () =>
          Effect.gen(function* () {
            const checked = validatePetitionInput(input, { mode: "update", now: new Date() })
            if (!checked.ok) return yield* invalid(checked.errors)
            const columns = Object.fromEntries(
              Object.entries(checked.value).filter(([, value]) => value !== undefined),
            )
            const set =
              Object.keys(columns).length > 0 ? sql`${sql.update(columns)},` : sql``
            yield* sql`
              UPDATE petition SET ${set} updated_at = now() AT TIME ZONE 'utc'
              WHERE id = ${id}
            `.pipe(Effect.orDie)
          }),
        ),
      closePetition: ({ id }) => setStatus(id, "closed"),
      markPetitionVictory: ({ id }) => setStatus(id, "victory"),
    })
  }),
)
