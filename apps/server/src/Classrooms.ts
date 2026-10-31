import {
  ClassroomDto,
  ClassroomRpcs,
  CurrentUser,
  invalidField,
  isUuid,
  MembershipDto,
  type MembershipRole,
  MembershipStatus,
  NotFound,
  type SignedIn,
} from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema, type Statement } from "effect/sql"
import {
  activeTa,
  authorizeCreateClassroom,
  canApprove,
  canChangeRole,
  canInvite,
  canRemove,
  classroomVisible,
  forbidden,
  isProfessor,
  type MembershipTarget,
  membershipVisible,
  requireConfirmed,
  visibleJoinCode,
} from "./ClassroomPolicy.ts"
import { AppConfig } from "./Config.ts"
import { classroomInviteEmail, membershipApprovalEmail } from "./Email.ts"
import { Mailer } from "./Mailer.ts"
import { requireParticipant } from "./Participant.ts"
import { petitionVisible } from "./PetitionPolicy.ts"

const classroomNotFound = new NotFound({ message: "Classroom not found" })
const membershipNotFound = new NotFound({ message: "Membership not found" })

/** Admission messages, word for word from `ValidateAdmission`. */
const existingMembershipMessages: Record<MembershipStatus, string> = {
  active: "You are already a member of this classroom",
  pending: "Your membership is awaiting approval",
  removed: "Your membership was removed; contact the professor",
}

const ClassroomTarget = Schema.Struct({
  id: Schema.String,
  professorId: Schema.String,
  archived: Schema.Boolean,
})

const MembershipTargetRow = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  role: Schema.Literals(["student", "ta"]),
  status: MembershipStatus,
  classroomId: Schema.String,
  professorId: Schema.String,
  archived: Schema.Boolean,
  actorIsTa: Schema.Boolean,
})

const Recipient = Schema.Struct({
  email: Schema.String,
  firstName: Schema.NullOr(Schema.String),
  classroomName: Schema.String,
  classroomDescription: Schema.NullOr(Schema.String),
})

export const ClassroomHandlers = ClassroomRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const mailer = yield* Mailer
    const { publicHost } = yield* AppConfig

    const classroomColumns = (actor: SignedIn) => sql`
      c.id, c.name, c.description, ${visibleJoinCode(sql, actor.id)} AS join_code, c.archived,
      c.allow_student_petitions,
      (SELECT count(*)::int FROM classroom_memberships a
        WHERE a.classroom_id = c.id AND a.status = 'active') AS member_count,
      (SELECT count(*)::int FROM petition p
        WHERE p.classroom_id = c.id AND ${petitionVisible(sql, actor, "p")}) AS petition_count,
      c.professor_id,
      json_build_object('id', pu.id, 'firstName', pu.first_name, 'lastName', pu.last_name)
        AS professor,
      c.organization_id, c.inserted_at, c.updated_at
      FROM classrooms c JOIN users pu ON pu.id = c.professor_id`

    const membershipColumns = sql`
      m.id, m.classroom_id, m.user_id, m.invited_by_id, m.role, m.status,
      m.joined_at, m.inserted_at,
      concat_ws(' ', u.first_name, u.last_name) AS member_name,
      json_build_object('id', u.id) AS "user",
      json_build_object('id', c.id, 'name', c.name) AS classroom
      FROM classroom_memberships m
      JOIN users u ON u.id = m.user_id
      JOIN classrooms c ON c.id = m.classroom_id`

    const decodeClassrooms = Schema.decodeUnknownEffect(Schema.Array(Schema.toType(ClassroomDto)))
    const decodeMemberships = Schema.decodeUnknownEffect(Schema.Array(Schema.toType(MembershipDto)))

    const listClassrooms = (
      actor: SignedIn,
      where: Statement.Fragment,
      page: Statement.Fragment = sql.literal(""),
    ) =>
      sql`SELECT ${classroomColumns(actor)} WHERE ${where} ORDER BY c.name, c.id ${page}`.pipe(
        Effect.flatMap(decodeClassrooms),
        Effect.orDie,
      )

    const listMemberships = (where: Statement.Fragment) =>
      sql`SELECT ${membershipColumns} WHERE ${where} ORDER BY m.inserted_at, m.id`.pipe(
        Effect.flatMap(decodeMemberships),
        Effect.orDie,
      )

    const classroomById = (actor: SignedIn, id: string) =>
      listClassrooms(actor, sql`c.id = ${id}`).pipe(Effect.map((rows) => rows[0]!))

    const membershipById = (id: string) =>
      listMemberships(sql`m.id = ${id}`).pipe(Effect.map((rows) => rows[0]!))

    // Decisions ----------------------------------------------------------------------------

    const findClassroomTarget = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: ClassroomTarget,
      execute: (id) => sql`
        SELECT id, professor_id, archived FROM classrooms WHERE id = ${id} FOR UPDATE`,
    })

    /**
     * Loads a classroom for a write by its professor: `NotFound` when the actor can't see it,
     * `Forbidden` when they can but don't teach it.
     */
    const professorsClassroom = (user: SignedIn, id: string) =>
      Effect.gen(function* () {
        const visible = yield* listClassrooms(
          user,
          sql`c.id = ${id} AND ${classroomVisible(sql, user.id)}`,
        )
        if (visible.length === 0) return yield* classroomNotFound
        const target = yield* findClassroomTarget(id).pipe(Effect.orDie)
        if (Option.isNone(target)) return yield* classroomNotFound
        if (!isProfessor(user, target.value)) return yield* forbidden
        return target.value
      })

    const findMembershipTarget = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: Schema.String, actorId: Schema.String }),
      Result: MembershipTargetRow,
      execute: ({ id, actorId }) => sql`
        SELECT m.id, m.user_id, m.role, m.status, m.classroom_id, c.professor_id, c.archived,
          ${activeTa(sql, actorId, sql`m.classroom_id`)} AS actor_is_ta
        FROM classroom_memberships m JOIN classrooms c ON c.id = m.classroom_id
        WHERE m.id = ${id} AND ${membershipVisible(sql, actorId)}
        FOR UPDATE OF m`,
    })

    /** Loads a membership the actor can see, for a write; `NotFound` otherwise. */
    const membershipTarget = (user: SignedIn, id: string) =>
      Effect.gen(function* () {
        yield* requireConfirmed(user)
        const target = yield* findMembershipTarget({ id, actorId: user.id }).pipe(Effect.orDie)
        if (Option.isNone(target)) return yield* membershipNotFound
        return target.value
      })

    const findAdmissionTarget = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: ClassroomTarget,
      execute: (id) => sql`SELECT id, professor_id, archived FROM classrooms WHERE id = ${id}`,
    })

    const findExisting = SqlSchema.findOneOption({
      Request: Schema.Struct({ classroomId: Schema.String, userId: Schema.String }),
      Result: Schema.Struct({ status: MembershipStatus }),
      execute: ({ classroomId, userId }) => sql`
        SELECT status FROM classroom_memberships
        WHERE classroom_id = ${classroomId} AND user_id = ${userId}`,
    })

    /** `ValidateAdmission`: the classroom is open, and `userId` isn't its professor or member. */
    const admit = (classroomId: string, userId: string) =>
      Effect.gen(function* () {
        const classroom = yield* findAdmissionTarget(classroomId).pipe(Effect.orDie)
        if (Option.isNone(classroom) || classroom.value.archived) {
          return yield* invalidField("classroomId", "Classroom is unavailable or archived")
        }
        if (classroom.value.professorId === userId) {
          return yield* invalidField("classroomId", "The professor already owns this classroom")
        }
        const existing = yield* findExisting({ classroomId, userId }).pipe(Effect.orDie)
        if (Option.isSome(existing)) {
          return yield* invalidField(
            "classroomId",
            existingMembershipMessages[existing.value.status],
          )
        }
      })

    /**
     * Admits `userId` and inserts the membership. A concurrent insert of the same membership
     * hits the unique index and reports the row that won.
     */
    const insertMembership = (row: {
      readonly classroomId: string
      readonly userId: string
      readonly role: MembershipRole
      readonly status: "pending" | "active"
      readonly invitedById: string | null
    }) =>
      Effect.gen(function* () {
        yield* admit(row.classroomId, row.userId)
        const joinedAt = row.status === "active" ? sql.literal("(now() AT TIME ZONE 'utc')") : null
        const inserted = yield* sql<{ id: string }>`
          INSERT INTO classroom_memberships
            (classroom_id, user_id, role, status, invited_by_id, joined_at)
          VALUES (${row.classroomId}, ${row.userId}, ${row.role}, ${row.status},
            ${row.invitedById}, ${joinedAt})
          ON CONFLICT (classroom_id, user_id) DO NOTHING
          RETURNING id
        `.pipe(Effect.orDie)
        if (inserted.length === 0) {
          yield* admit(row.classroomId, row.userId)
          return yield* Effect.die(new Error("membership insert conflicted without a row"))
        }
        return yield* membershipById(inserted[0]!.id)
      })

    const findRecipient = SqlSchema.findOne({
      Request: Schema.String,
      Result: Recipient,
      execute: (membershipId) => sql`
        SELECT u.email::text AS email, u.first_name, c.name AS classroom_name,
          c.description AS classroom_description
        FROM classroom_memberships m
        JOIN users u ON u.id = m.user_id JOIN classrooms c ON c.id = m.classroom_id
        WHERE m.id = ${membershipId}`,
    })

    /** Sends inside the transaction, so a failed send rolls the write back, as in Elixir. */
    const sendInvite = (membershipId: string, invitedBy: SignedIn) =>
      Effect.gen(function* () {
        const recipient = yield* findRecipient(membershipId).pipe(Effect.orDie)
        yield* mailer.send(
          classroomInviteEmail({
            publicHost,
            to: recipient.email,
            firstName: recipient.firstName,
            classroom: {
              name: recipient.classroomName,
              description: recipient.classroomDescription,
            },
            invitedBy,
          }),
        )
      }).pipe(Effect.orDie)

    const sendApproval = (membershipId: string) =>
      Effect.gen(function* () {
        const recipient = yield* findRecipient(membershipId).pipe(Effect.orDie)
        yield* mailer.send(
          membershipApprovalEmail({
            publicHost,
            to: recipient.email,
            firstName: recipient.firstName,
            classroom: { name: recipient.classroomName },
          }),
        )
      }).pipe(Effect.orDie)

    const findUserByEmail = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: Schema.Struct({ id: Schema.String }),
      execute: (email) => sql`SELECT id FROM users WHERE email = ${email}`,
    })

    const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      sql.withTransaction(effect).pipe(Effect.catchTag("SqlError", Effect.die))

    /** Updates a classroom its professor owns and returns it. */
    const updateOwnClassroom = (id: string, set: Statement.Fragment) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        return yield* transaction(
          Effect.gen(function* () {
            const target = yield* professorsClassroom(user, id)
            yield* sql`
              UPDATE classrooms SET ${set}, updated_at = (now() AT TIME ZONE 'utc')
              WHERE id = ${target.id}`.pipe(Effect.orDie)
            return yield* classroomById(user, target.id)
          }),
        )
      })

    /** Changes a membership the actor may change and returns it. */
    const updateMembership = (
      id: string,
      allowed: (user: SignedIn, target: MembershipTarget) => boolean,
      set: Statement.Fragment,
      after: (target: typeof MembershipTargetRow.Type) => Effect.Effect<void> = () => Effect.void,
    ) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        return yield* transaction(
          Effect.gen(function* () {
            const target = yield* membershipTarget(user, id)
            if (!allowed(user, target)) return yield* forbidden
            yield* sql`
              UPDATE classroom_memberships
              SET ${set}, updated_at = (now() AT TIME ZONE 'utc')
              WHERE id = ${target.id}`.pipe(Effect.orDie)
            yield* after(target)
            return yield* membershipById(target.id)
          }),
        )
      })

    return ClassroomRpcs.of({
      getClassrooms: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* listClassrooms(user, classroomVisible(sql, user.id))
        }),

      getClassroomById: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const [classroom] = yield* listClassrooms(
            user,
            sql`c.id = ${id} AND ${classroomVisible(sql, user.id)}`,
          )
          return classroom ?? (yield* classroomNotFound)
        }),

      getMyClassrooms: ({ archived, limit, offset }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const where = sql.and([
            classroomVisible(sql, user.id),
            archived === undefined ? sql`TRUE` : sql`c.archived = ${archived}`,
          ])
          const pageLimit =
            limit === undefined ? null : Math.min(Math.max(Math.trunc(limit), 1), 250)
          const pageOffset = Math.max(Math.trunc(offset ?? 0), 0)
          const page =
            pageLimit === null
              ? sql`OFFSET ${pageOffset}`
              : sql`LIMIT ${pageLimit} OFFSET ${pageOffset}`
          const results = yield* listClassrooms(user, where, page)
          const [total] = yield* sql<{ count: number }>`
            SELECT count(*)::int AS count FROM classrooms c WHERE ${where}`.pipe(Effect.orDie)
          const count = total!.count
          return {
            results,
            count,
            limit: pageLimit,
            offset: pageOffset,
            hasMore: pageOffset + results.length < count,
          }
        }),

      createClassroom: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* authorizeCreateClassroom(user)
          yield* requireParticipant
          const [row] = yield* sql<{ id: string }>`
            INSERT INTO classrooms
              (name, description, allow_student_petitions, join_code, professor_id,
                organization_id)
            VALUES (${input.name}, ${input.description ?? null},
              ${input.allowStudentPetitions ?? true},
              gen_random_uuid(), ${user.id}, ${user.organizationId})
            RETURNING id
          `.pipe(Effect.orDie)
          return yield* classroomById(user, row!.id)
        }),

      updateClassroom: ({ id, ...input }) =>
        Effect.gen(function* () {
          const changes: Record<string, unknown> = {}
          if (input.name !== undefined) changes.name = input.name
          if (input.description !== undefined) changes.description = input.description
          if (input.allowStudentPetitions !== undefined) {
            changes.allowStudentPetitions = input.allowStudentPetitions
          }
          if (Object.keys(changes).length === 0) {
            const user = yield* CurrentUser
            const target = yield* transaction(professorsClassroom(user, id))
            return yield* classroomById(user, target.id)
          }
          return yield* updateOwnClassroom(id, sql`${sql.update(changes)}`)
        }),

      archiveClassroom: ({ id }) => updateOwnClassroom(id, sql`archived = TRUE`),

      unarchiveClassroom: ({ id }) => updateOwnClassroom(id, sql`archived = FALSE`),

      regenerateJoinCode: ({ id }) => updateOwnClassroom(id, sql`join_code = gen_random_uuid()`),

      getClassroomMemberships: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* listMemberships(membershipVisible(sql, user.id))
        }),

      getMembershipsForClassroom: ({ classroomId }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* listMemberships(
            sql`m.classroom_id = ${classroomId} AND ${membershipVisible(sql, user.id)}`,
          )
        }),

      getPendingMemberships: ({ classroomId }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* listMemberships(
            sql`m.classroom_id = ${classroomId} AND m.status = 'pending'
              AND ${membershipVisible(sql, user.id)}`,
          )
        }),

      joinClassroomByCode: ({ joinCode }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* requireConfirmed(user)
          // Join codes are UUIDs; anything else matches no classroom.
          const [classroom] = isUuid(joinCode)
            ? yield* sql<{ id: string }>`
                SELECT id FROM classrooms WHERE join_code = ${joinCode} AND NOT archived
              `.pipe(Effect.orDie)
            : []
          if (classroom === undefined) {
            return yield* invalidField("joinCode", "Invalid or archived join code")
          }
          return yield* insertMembership({
            classroomId: classroom.id,
            userId: user.id,
            role: "student",
            status: "active",
            invitedById: null,
          })
        }),

      requestToJoinClassroom: ({ classroomId }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* requireConfirmed(user)
          return yield* insertMembership({
            classroomId,
            userId: user.id,
            role: "student",
            status: "pending",
            invitedById: null,
          })
        }),

      inviteToClassroom: ({ classroomId, email, role = "student" }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* requireConfirmed(user)
          return yield* transaction(
            Effect.gen(function* () {
              // Lock the classroom first, then check the inviter's role in a later statement:
              // one that waited for the lock would see the role as of before the wait.
              const [classroom] = yield* sql`
                SELECT id FROM classrooms WHERE id = ${classroomId} FOR UPDATE
              `.pipe(
                Effect.andThen(
                  sql<{ professorId: string; actorIsTa: boolean }>`
                    SELECT c.professor_id, ${activeTa(sql, user.id, sql`c.id`)} AS actor_is_ta
                    FROM classrooms c WHERE c.id = ${classroomId}
                  `,
                ),
                Effect.orDie,
              )
              if (classroom === undefined || !canInvite(user, { ...classroom, role })) {
                return yield* forbidden
              }
              const invitee = yield* findUserByEmail(email.trim()).pipe(Effect.orDie)
              if (Option.isNone(invitee)) return yield* invalidField("email", "User not found")
              const membership = yield* insertMembership({
                classroomId,
                userId: invitee.value.id,
                role,
                status: "pending",
                invitedById: user.id,
              })
              yield* sendInvite(membership.id, user)
              return membership
            }),
          )
        }),

      approveMembership: ({ id }) =>
        updateMembership(
          id,
          canApprove,
          sql`status = 'active', joined_at = (now() AT TIME ZONE 'utc')`,
          (target) => sendApproval(target.id),
        ),

      removeFromClassroom: ({ id }) => updateMembership(id, canRemove, sql`status = 'removed'`),

      promoteToTa: ({ id }) => updateMembership(id, canChangeRole, sql`role = 'ta'`),

      demoteToStudent: ({ id }) => updateMembership(id, canChangeRole, sql`role = 'student'`),
    })
  }),
)
