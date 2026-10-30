import { type Actor, Forbidden, invalidRequest, NotFound, type SignedIn } from "@petitionu/domain"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { petitionVisible } from "./PetitionPolicy.ts"

const actorId = (actor: Actor) => (actor._tag === "SignedIn" ? actor.id : null)

/**
 * Read scoping for comments (Ash's comment read policy): a SQL condition on the comment row
 * aliased `comment` that holds when `actor` may see it. The comment must be neither hidden by a
 * moderator nor deleted by its author, and its petition must be visible.
 */
export const commentVisible = (sql: SqlClient.SqlClient, actor: Actor, comment = "comment") => {
  const c = sql(comment)
  return sql`(${c}.hidden_at IS NULL AND ${c}.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM petition cv_p WHERE cv_p.id = ${c}.petition_id
      AND ${petitionVisible(sql, actor, "cv_p")}))`
}

/**
 * `can_edit`: the actor wrote the comment and its petition isn't in an archived classroom.
 * Editing and deleting also need the comment to be visible.
 */
export const commentEditable = (sql: SqlClient.SqlClient, actor: Actor, comment = "comment") => {
  const c = sql(comment)
  const id = actorId(actor)
  if (id === null) return sql`false`
  return sql`(${c}.user_id = ${id}
    AND NOT EXISTS (SELECT 1 FROM petition ce_p JOIN classrooms ce_c ON ce_c.id = ce_p.classroom_id
      WHERE ce_p.id = ${c}.petition_id AND ce_c.archived))`
}

const notFound = new NotFound({ message: "Comment not found" })

/**
 * Ash's comment `update`/`destroy` policy: locks the comment `FOR UPDATE` (so call it inside
 * the transaction that writes), then checks that `user` may change it. A comment the user can't
 * see is `NotFound`; someone else's is `Forbidden`. Archived classrooms are read-only, so a
 * comment there is `Invalid`, with participation's message.
 */
export const checkCommentWrite = (sql: SqlClient.SqlClient, user: SignedIn, commentId: string) =>
  Effect.gen(function* () {
    const [comment] = yield* sql<{ readonly isAuthor: boolean; readonly editable: boolean }>`
      SELECT c.user_id = ${user.id} AS is_author,
        ${commentEditable(sql, user, "c")} AS editable
      FROM comment c
      WHERE c.id = ${commentId} AND ${commentVisible(sql, user, "c")}
      FOR UPDATE OF c
    `.pipe(Effect.orDie)
    if (!comment) return yield* notFound
    if (!comment.isAuthor) {
      return yield* new Forbidden({ message: "Only the author can change this comment." })
    }
    if (!comment.editable) {
      return yield* invalidRequest("This classroom is archived or unavailable.")
    }
  })
