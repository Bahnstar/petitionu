import { type Context, Duration, Effect, Layer, Result } from "effect"
import { SqlClient } from "effect/sql"
import {
  SchoolVerification,
  SchoolVerificationQueue,
  queueName,
  queueTable,
} from "../../src/SchoolVerification.ts"
import type { SchoolRegistry } from "../../src/SchoolRegistry.ts"
import { makeTestApp } from "./harness.ts"

/**
 * Seam B: the school verification queue, run by hand.
 *
 * Test apps don't run the queue worker (`JOB_WORKERS=false`), so jobs stay queued until a test
 * drains them. Backoff is tested with the real SQL store: it times retries and deferrals with
 * the database clock, which `TestClock` can't move, so `elapse` moves the stored times back
 * instead, as if that much time had passed.
 */
export interface Jobs {
  /**
   * Runs every job that is due, one at a time, until none is due. Returns each attempt's
   * outcome: `activated`, `skipped`, `cancelled`, `deferred`, or `failed:<reason>`.
   */
  readonly drain: Effect.Effect<ReadonlyArray<string>>
  /**
   * Lets `duration` pass for the job: moves queued jobs' due times and schools' last registry
   * checks back by that much.
   */
  elapse(duration: Duration.Input): Effect.Effect<void>
  /** The user's job from confirmation (at most one, since those dedupe by user). */
  jobsFor(userId: string): Effect.Effect<
    ReadonlyArray<{
      readonly state: "pending" | "completed" | "failed"
      readonly attempts: number
      /** Whole seconds until the job is next due; 0 or less when it is due. */
      readonly dueIn: number
    }>
  >
  /** The state of every job for a user, including retries, oldest first. */
  allJobsFor(userId: string): Effect.Effect<ReadonlyArray<string>>
}

const describeFailure = (cause: unknown): string => {
  const error = cause as { readonly _tag?: string; readonly reason?: string }
  return `failed:${error.reason ?? error._tag ?? "unknown"}`
}

/** A test app (see `makeTestApp`) plus its verification queue, drained by hand. */
export const makeJobsApp = (options: Parameters<typeof makeTestApp>[0] = {}) =>
  Effect.gen(function* () {
    let services: Context.Context<SqlClient.SqlClient | SchoolRegistry> | undefined
    const capture = Layer.effectDiscard(
      Effect.gen(function* () {
        services = yield* Effect.context<SqlClient.SqlClient | SchoolRegistry>()
      }),
    )
    const app = yield* makeTestApp({
      ...options,
      env: { JOB_WORKERS: "false", ...options.env },
      routes: options.routes ? Layer.merge(options.routes, capture) : capture,
    })
    const withServices = <A, E>(
      effect: Effect.Effect<A, E, SqlClient.SqlClient | SchoolRegistry>,
    ): Effect.Effect<A> =>
      Effect.suspend(() => Effect.provideContext(Effect.orDie(effect), services!))

    const dueCount = Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const [row] = yield* sql<{ count: number }>`
        SELECT count(*)::int AS count FROM ${sql(queueTable)}
        WHERE queue_name = ${queueName} AND state = 'pending' AND visible_at <= now()
          AND acquired_by IS NULL
      `
      return row!.count
    })

    const drain = withServices(
      Effect.gen(function* () {
        const outcomes: Array<string> = []
        while ((yield* dueCount) > 0) {
          const result = yield* Effect.result(SchoolVerification.processNext)
          outcomes.push(Result.isSuccess(result) ? result.success : describeFailure(result.failure))
        }
        return outcomes
      }).pipe(
        Effect.provide(SchoolVerificationQueue.layerWith({ pollInterval: "10 millis" })),
        Effect.scoped,
      ),
    )

    const elapse = (duration: Duration.Input) =>
      withServices(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const seconds = Math.ceil(Duration.toSeconds(Duration.fromInputUnsafe(duration)))
          yield* sql`
            UPDATE ${sql(queueTable)} SET visible_at = visible_at - make_interval(secs => ${seconds})
            WHERE queue_name = ${queueName} AND state = 'pending'
          `
          yield* sql`
            UPDATE organization
            SET registry_checked_at = registry_checked_at - make_interval(secs => ${seconds})
            WHERE registry_checked_at IS NOT NULL
          `
        }),
      )

    const jobsFor = (userId: string) =>
      withServices(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          return yield* sql<{
            state: "pending" | "completed" | "failed"
            attempts: number
            dueIn: number
          }>`
            SELECT state, attempts,
              ceil(extract(epoch FROM visible_at - now()))::int AS "dueIn"
            FROM ${sql(queueTable)} WHERE queue_name = ${queueName} AND id = ${userId}
          `
        }),
      )

    const allJobsFor = (userId: string) =>
      withServices(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql<{ state: string }>`
            SELECT state FROM ${sql(queueTable)}
            WHERE queue_name = ${queueName} AND element::jsonb ->> 'userId' = ${userId}
            ORDER BY sequence
          `
          return rows.map((row) => row.state)
        }),
      )

    return { app, jobs: { drain, elapse, jobsFor, allJobsFor } satisfies Jobs }
  })
