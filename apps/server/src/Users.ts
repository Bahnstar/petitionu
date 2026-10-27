import {
  ActivityPetition,
  ActivitySignature,
  type Actor,
  CurrentActor,
  CurrentUser,
  NotFound,
  Notification,
  Preference,
  type SignedIn,
  UserDetails,
  type UserDto,
  UsersRpcs,
} from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import {
  authorizeSetRole,
  canSeeActivity,
  canSeeDetails,
  validateRequestedRole,
  visiblePetitions,
  visibleUsers,
} from "./UsersPolicy.ts"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const userNotFound = new NotFound({ message: "User not found" })

const ActivityCounts = Schema.Struct({
  numPetitions: Schema.Number,
  numSigned: Schema.Number,
  totalPetitionSignatures: Schema.Number,
})

const isoUtc = (sql: SqlClient.SqlClient, column: string) =>
  sql`to_char(${sql.literal(column)}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/** Fields of `UserDetails`, selected from `users` aliased `u`. */
const userColumns = (sql: SqlClient.SqlClient) => sql`
  u.id, u.first_name, u.last_name, u.email::text AS email, u.role,
  u.graduation_year::int AS graduation_year, u.organization_id,
  u.confirmed_at IS NOT NULL AS email_verified,
  (u.confirmed_at IS NOT NULL AND u.organization_id IS NOT NULL
    AND coalesce(u.first_name, '') <> '' AND coalesce(u.last_name, '') <> '') AS profile_complete
`

/** An `ActivityPetition` as JSON, from `petition` aliased `p`. */
const petitionJson = (sql: SqlClient.SqlClient) => sql`
  json_build_object(
    'id', p.id, 'title', p.title, 'description', p.description,
    'status', coalesce(p.status, 'open'),
    'trending', sc.count > 5 AND sc.count::float / coalesce(p.goal, 1000) >= 0.5,
    'signaturesCount', sc.count, 'goal', coalesce(p.goal, 1000),
    'isAnonymous', coalesce(p.is_anonymous, false),
    'deadline', to_char(p.deadline, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'insertedAt', ${isoUtc(sql, "p.inserted_at")},
    'category', CASE WHEN cat.id IS NULL THEN NULL
      ELSE json_build_object('id', cat.id, 'name', cat.name, 'color', cat.color) END,
    'author', CASE WHEN coalesce(p.is_anonymous, false) THEN 'Anonymous student'
      ELSE coalesce((SELECT concat_ws(' ', a.first_name, a.last_name) FROM users a
        WHERE a.id = p.user_id), 'Student') END
  )
`

const petitionJoins = (sql: SqlClient.SqlClient) => sql`
  CROSS JOIN LATERAL (SELECT count(*)::int AS count FROM signature s2 WHERE s2.petition_id = p.id) sc
  LEFT JOIN category cat ON cat.id = p.category_id
`

export const UsersHandlers = UsersRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const activity = Effect.fnUntraced(function* (actor: SignedIn) {
      const visible = visiblePetitions(sql, actor, "p")
      const [counts] = yield* SqlSchema.findAll({
        Request: Schema.Void,
        Result: ActivityCounts,
        execute: () => sql`
          SELECT
            (SELECT count(*)::int FROM petition p WHERE p.user_id = ${actor.id} AND ${visible})
              AS num_petitions,
            (SELECT count(*)::int FROM signature s JOIN petition p ON p.id = s.petition_id
              WHERE s.user_id = ${actor.id} AND ${visible}) AS num_signed,
            (SELECT count(*)::int FROM signature s JOIN petition p ON p.id = s.petition_id
              WHERE p.user_id = ${actor.id} AND ${visible}) AS total_petition_signatures
        `,
      })(undefined)
      const petitions = yield* SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ petition: ActivityPetition }),
        execute: () => sql`
          SELECT ${petitionJson(sql)} AS petition
          FROM petition p ${petitionJoins(sql)}
          WHERE p.user_id = ${actor.id} AND ${visible}
          ORDER BY p.inserted_at DESC LIMIT 4
        `,
      })(undefined)
      const signatures = yield* SqlSchema.findAll({
        Request: Schema.Void,
        Result: ActivitySignature,
        execute: () => sql`
          SELECT s.id, ${isoUtc(sql, "s.inserted_at")} AS inserted_at,
            ${petitionJson(sql)} AS petition
          FROM signature s JOIN petition p ON p.id = s.petition_id ${petitionJoins(sql)}
          WHERE s.user_id = ${actor.id} AND ${visible}
          ORDER BY s.inserted_at DESC LIMIT 4
        `,
      })(undefined)
      return {
        ...counts!,
        numPetitionSignees: counts!.numSigned,
        petitions: petitions.map((row) => row.petition),
        signatures,
      }
    })

    const findUser = (actor: Actor, id: string, options: { readonly lock?: boolean } = {}) =>
      SqlSchema.findOneOption({
        Request: Schema.String,
        Result: UserDetails,
        execute: (userId) => sql`
          SELECT ${userColumns(sql)} FROM users u
          WHERE u.id = ${userId} AND ${visibleUsers(sql, actor, "u")}
          ${options.lock ? sql`FOR UPDATE OF u` : sql``}
        `,
      })(id)

    const listUsers = (actor: Actor) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: UserDetails,
        execute: () => sql`
          SELECT ${userColumns(sql)} FROM users u
          WHERE ${visibleUsers(sql, actor, "u")}
          ORDER BY u.inserted_at, u.id
        `,
      })(undefined)

    const findPreferences = SqlSchema.findAll({
      Request: Schema.String,
      Result: Preference,
      execute: (userId) => sql`
        SELECT id, name, value FROM preference WHERE user_id = ${userId} ORDER BY inserted_at, id
      `,
    })

    const findNotifications = SqlSchema.findAll({
      Request: Schema.String,
      Result: Notification,
      execute: (userId) => sql`
        SELECT n.id, n.title, n.body, n.status, ${isoUtc(sql, "n.inserted_at")} AS inserted_at
        FROM notification n WHERE n.user_id = ${userId} ORDER BY n.inserted_at DESC, n.id DESC
      `,
    })

    /** The user in the shape the field policies allow `actor` to see. */
    const present = (actor: Actor, user: UserDetails): UserDto =>
      canSeeDetails(actor, user)
        ? user
        : { id: user.id, firstName: user.firstName, lastName: user.lastName }

    return UsersRpcs.of({
      getUserById: ({ id, includeStats }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor
          if (!uuidPattern.test(id)) return yield* userNotFound
          const found = yield* findUser(actor, id).pipe(Effect.orDie)
          if (Option.isNone(found)) return yield* userNotFound
          const user = found.value
          if (includeStats && actor._tag === "SignedIn" && canSeeActivity(actor, user)) {
            return { ...user, ...(yield* activity(actor).pipe(Effect.orDie)) }
          }
          return present(actor, user)
        }),
      getUsers: () =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor
          const users = yield* listUsers(actor).pipe(Effect.orDie)
          return users.map((user) => present(actor, user))
        }),
      setUserRole: ({ id, role }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser
          if (!uuidPattern.test(id)) return yield* userNotFound
          const target = yield* findUser(actor, id, { lock: true }).pipe(Effect.orDie)
          if (Option.isNone(target)) return yield* userNotFound
          yield* validateRequestedRole(actor, role)
          yield* authorizeSetRole(actor, target.value)
          yield* sql`UPDATE users SET role = ${role}, updated_at = now() AT TIME ZONE 'utc'
            WHERE id = ${id}`.pipe(Effect.orDie)
          return { ...target.value, role }
        }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die)),
      getPreferences: () =>
        Effect.flatMap(CurrentUser, (user) => findPreferences(user.id)).pipe(Effect.orDie),
      getNotifications: () =>
        Effect.flatMap(CurrentUser, (user) => findNotifications(user.id)).pipe(Effect.orDie),
    })
  }),
)
