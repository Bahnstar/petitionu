import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { UserConfirmed } from "../../src/Confirmation.ts"

/**
 * A `UserConfirmed` that records each user it runs for, together with whether the user's
 * `confirmed_at` was already visible inside its transaction.
 */
export const recordConfirmations = () => {
  const confirmed: Array<{ readonly userId: string; readonly confirmedAtSet: boolean }> = []
  const layer = Layer.effect(
    UserConfirmed,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return (userId: string) =>
        Effect.gen(function* () {
          const [row] = yield* sql<{ set: boolean }>`
            SELECT confirmed_at IS NOT NULL AS set FROM users WHERE id = ${userId}
          `
          confirmed.push({ userId, confirmedAtSet: row?.set ?? false })
        })
    }),
  )
  return { confirmed, layer }
}
