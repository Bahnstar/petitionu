import {
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
import { petitionVisible } from "./PetitionPolicy.ts"
import { selectPetitions } from "./PetitionQueries.ts"
import {
  authorizeSetRole,
  canSeeActivity,
  canSeeDetails,
  validateRequestedRole,
  visibleUsers,
} from "./UsersPolicy.ts"
import { isoTimestamp } from "./Timestamps.ts"

const userNotFound = new NotFound({ message: "User not found" })

const ActivityCounts = Schema.Struct({
  numPetitions: Schema.Number,
  numSigned: Schema.Number,
  totalPetitionSignatures: Schema.Number,
})

/** Fields of `UserDetails`, selected from `users` aliased `u`. */
const userColumns = (sql: SqlClient.SqlClient) => sql`
  u.id, u.first_name, u.last_name, u.email::text AS email, u.role,
  u.graduation_year::int AS graduation_year, u.organization_id,
  u.confirmed_at IS NOT NULL AS email_verified,
  (u.confirmed_at IS NOT NULL AND u.organization_id IS NOT NULL
    AND coalesce(u.first_name, '') <> '' AND coalesce(u.last_name, '') <> '') AS profile_complete
`

export const UsersHandlers = UsersRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const activity = Effect.fnUntraced(function* (actor: SignedIn) {
      const visible = petitionVisible(sql, actor, "p")
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
      const petitions = yield* selectPetitions(sql, actor, sql`p.user_id = ${actor.id}`, {
        limit: 4,
      })
      const signed = yield* sql<{ id: string; insertedAt: string; petitionId: string }>`
        SELECT s.id, ${isoTimestamp(sql, "s.inserted_at")} AS inserted_at, s.petition_id
        FROM signature s JOIN petition p ON p.id = s.petition_id
        WHERE s.user_id = ${actor.id} AND ${visible}
        ORDER BY s.inserted_at DESC LIMIT 4
      `
      const signedPetitions =
        signed.length === 0
          ? []
          : yield* selectPetitions(
              sql,
              actor,
              sql`p.id IN ${sql.in(signed.map((s) => s.petitionId))}`,
            )
      const signatures = signed.map(({ id, insertedAt, petitionId }) => ({
        id,
        insertedAt,
        petition: signedPetitions.find((petition) => petition.id === petitionId)!,
      }))
      return {
        ...counts!,
        numPetitionSignees: counts!.numSigned,
        petitions,
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
        SELECT n.id, n.title, n.body, n.status, ${isoTimestamp(sql, "n.inserted_at")} AS inserted_at
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
