import { Effect, Layer } from "effect"
import { PersistedQueue } from "effect/persistence"
import { queueTable } from "../SchoolVerification.ts"

/**
 * The job queue's table. The SQL queue store owns its schema and migrates it itself (in
 * `job_queue_migrations`); opening the store here runs those migrations during the deploy's
 * migrate step, so the server never has to change the schema while handling a request.
 */
export default Layer.build(PersistedQueue.layerStoreSql({ tableName: queueTable })).pipe(
  Effect.scoped,
  Effect.asVoid,
)
