import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Deleting a comment keeps its row, so content reports (whose `comment_id` foreign key has no
 * `ON DELETE`) and replies (`parent_comment_id`) keep pointing at it. A deleted comment has
 * `deleted_at` set and its text cleared, and drops out of every read like a hidden one.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`ALTER TABLE public.comment ADD COLUMN deleted_at timestamp without time zone`)
    .withoutTransform
})
