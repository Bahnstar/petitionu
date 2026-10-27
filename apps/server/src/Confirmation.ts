import { Context, Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * What runs when a user becomes confirmed (email verification, magic-link sign-in or password
 * reset). It runs once per user, inside the transaction that sets `confirmed_at`, so SQL it
 * runs through `SqlClient` (including queue offers) commits or rolls back with it. The default
 * does nothing; provide one with `Layer.succeed(UserConfirmed)(...)` or `Layer.effect`.
 */
export const UserConfirmed = Context.Reference<(userId: string) => Effect.Effect<void, unknown>>(
  "petitionu/UserConfirmed",
  { defaultValue: () => () => Effect.void },
)

/**
 * Sets `confirmed_at` (and `email_verified`) once Better Auth has marked the user's email
 * verified, then runs `UserConfirmed`. Idempotent: a confirmed user is left alone.
 */
export const markConfirmed = Effect.fn("markConfirmed")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient
  const onConfirmed = yield* UserConfirmed
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const confirmed = yield* sql`
        UPDATE users
        SET confirmed_at = (now() AT TIME ZONE 'utc'), email_verified = true
        WHERE id = ${userId} AND confirmed_at IS NULL
        RETURNING id
      `
      if (confirmed.length > 0) yield* onConfirmed(userId)
    }),
  )
})
