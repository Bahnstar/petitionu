import { EmailDomain } from "@petitionu/domain"
import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Schedule,
  Schema,
  Semaphore,
} from "effect"
import { PersistedQueue } from "effect/persistence"
import { SqlClient, SqlSchema } from "effect/sql"
import { SchoolRegistry } from "./SchoolRegistry.ts"

/** The table the SQL queue store keeps jobs in (created by the store itself). */
export const queueTable = "job_queue"
export const queueName = "verify_school_membership"

export const VerifySchoolMembershipJob = Schema.Struct({ userId: Schema.String })

/** Waits 60 seconds × 2^(attempt − 1) before a retry, capped at one day. */
export const retrySchedule = Schedule.min([
  Schedule.exponential("60 seconds"),
  Schedule.spaced("1 day"),
])

const maxAttempts = 20
const attemptTimeout = Duration.seconds(20)
/** How long a job waits after another job's registry lookup failed for the same school. */
const deferral = 60

type Queue = PersistedQueue.PersistedQueue<typeof VerifySchoolMembershipJob.Type>

/**
 * The school verification queue. Jobs are keyed by user id, so confirmation queues a user at
 * most once; `requeue` adds later jobs under their own ids. An offer made inside a SQL
 * transaction commits or rolls back with it.
 *
 * The SQL store connects (to check its migrations, applied by `0003_job_queue`) in the
 * background and on first use rather than at startup, so the app still starts, and
 * `/healthz` reports the outage, while the database is unreachable.
 */
export class SchoolVerificationQueue extends Context.Service<
  SchoolVerificationQueue,
  { readonly queue: Effect.Effect<Queue, PersistedQueue.PersistedQueueError> }
>()("petitionu/SchoolVerificationQueue") {
  static readonly layerWith = (options: { readonly pollInterval?: Duration.Input }) =>
    Layer.effect(
      SchoolVerificationQueue,
      Effect.gen(function* () {
        const scope = yield* Effect.scope
        const context = yield* Effect.context<SqlClient.SqlClient>()
        const sql = yield* SqlClient.SqlClient
        const store = PersistedQueue.layer.pipe(
          Layer.provide(
            PersistedQueue.layerStoreSql({
              tableName: queueTable,
              pollInterval: options.pollInterval ?? "1 second",
            }),
          ),
        )
        const lock = Semaphore.makeUnsafe(1)
        let built: Queue | undefined
        const queue = lock.withPermits(1)(
          Effect.suspend(() =>
            built
              ? Effect.succeed(built)
              : Layer.buildWithScope(store, scope).pipe(
                  Effect.flatMap((factory) =>
                    PersistedQueue.make({
                      name: queueName,
                      schema: VerifySchoolMembershipJob,
                      maxAttempts,
                      retrySchedule,
                    }).pipe(Effect.provideContext(factory)),
                  ),
                  Effect.tap((made) => Effect.sync(() => (built = made))),
                  Effect.provideContext(context),
                  // Opened outside any transaction the first offer happens to run in.
                  Effect.updateContext((services: Context.Context<never>) =>
                    Context.omit(sql.transactionService)(services),
                  ),
                  Effect.mapError(
                    (cause) =>
                      new PersistedQueue.PersistedQueueError({
                        message: "Could not open the job queue",
                        cause,
                      }),
                  ),
                ),
          ),
        )
        yield* queue.pipe(Effect.retry(Schedule.spaced("5 seconds")), Effect.forkScoped)
        return SchoolVerificationQueue.of({ queue })
      }),
    )

  static readonly layer = SchoolVerificationQueue.layerWith({})

  /** Queues verification of `userId`'s pending school; a no-op if it's already queued. */
  static readonly enqueue = (userId: string) =>
    SchoolVerificationQueue.use(({ queue }) =>
      Effect.flatMap(queue, (q) => q.offer({ userId }, { id: userId })),
    )

  /**
   * Queues a new job for `userId`, with a fresh set of attempts. The store keeps a failed job's
   * id forever and ignores offers that reuse it, so this one takes a generated id.
   */
  static readonly requeue = (userId: string) =>
    SchoolVerificationQueue.use(({ queue }) => Effect.flatMap(queue, (q) => q.offer({ userId })))
}

/**
 * Every verification job for a user, oldest first. The queue has no read API, so this selects
 * from the store's table directly, which an Effect upgrade could break.
 */
export const verificationJobs = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<{
      id: string
      state: "pending" | "completed" | "failed"
      attempts: number
      lastFailure: string | null
    }>`
      SELECT id, state, attempts, last_failure
      FROM ${sql(queueTable)}
      WHERE queue_name = ${queueName} AND element::jsonb ->> 'userId' = ${userId}
      ORDER BY sequence
    `
  })

/** A conditional update matched no row: the user or school changed while the job ran. */
export class StaleRecord extends Schema.TaggedError<StaleRecord>()("StaleRecord", {
  message: Schema.String,
}) {}

/** How a job attempt ended, when it didn't fail. */
export type Outcome = "activated" | "skipped" | "cancelled" | "deferred"

const UserRow = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  organizationId: Schema.NullOr(Schema.String),
  pendingOrganizationId: Schema.NullOr(Schema.String),
  confirmed: Schema.Boolean,
})

const OrganizationRow = Schema.Struct({
  id: Schema.String,
  domain: Schema.NullOr(Schema.String),
  verificationStatus: Schema.String,
  recentlyFailed: Schema.Boolean,
})

/** Whether an email address belongs to a school's domain, exactly or as a subdomain. */
export const matchesDomain = (email: string, domain: string | null) => {
  const host = EmailDomain.fromEmail(email)
  const school = domain?.toLowerCase()
  return host !== undefined && (host === school || EmailDomain.schoolDomain(host) === school)
}

/**
 * Moves a waiting user into their pending school. Checks in SQL that the user and the school
 * are still what the caller read and that the school is verified or approved; returns whether
 * the user moved.
 */
export const activateMembership = Effect.fn("activateMembership")(function* (
  user: { readonly id: string; readonly email: string },
  organization: { readonly id: string; readonly domain: string },
) {
  const sql = yield* SqlClient.SqlClient
  const activated = yield* sql`
    UPDATE users u
    SET organization_id = ${organization.id}, pending_organization_id = NULL,
      updated_at = (now() AT TIME ZONE 'utc')
    WHERE u.id = ${user.id} AND u.organization_id IS NULL AND u.confirmed_at IS NOT NULL
      AND u.email = ${user.email} AND u.pending_organization_id = ${organization.id}
      AND EXISTS (
        SELECT 1 FROM organization o
        WHERE o.id = ${organization.id} AND o.domain = ${organization.domain}
          AND o.verification_status IN ('verified', 'approved')
      )
    RETURNING u.id
  `
  return activated.length > 0
})

/**
 * One attempt at `VerifySchoolMembership`: checks the user's pending school against the
 * registry, records the result on the school, and moves the user into it once it's verified.
 * Only users who are confirmed, have no organization and have a pending one are handled.
 */
export const verifySchoolMembership = Effect.fn("verifySchoolMembership")(function* (
  userId: string,
) {
  const sql = yield* SqlClient.SqlClient
  const registry = yield* SchoolRegistry
  const findUser = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: UserRow,
    execute: (id) => sql`
      SELECT id, email::text AS email, organization_id, pending_organization_id,
        confirmed_at IS NOT NULL AS confirmed
      FROM users WHERE id = ${id}
    `,
  })
  const findOrganization = SqlSchema.findOne({
    Request: Schema.String,
    Result: OrganizationRow,
    execute: (id) => sql`
      SELECT id, domain::text AS domain, verification_status,
        (registry_error IS NOT NULL AND registry_checked_at IS NOT NULL
          AND registry_checked_at > (now() AT TIME ZONE 'utc') - interval '${sql.literal(String(deferral))} seconds')
          AS recently_failed
      FROM organization WHERE id = ${id}
    `,
  })

  const user = yield* Effect.orDie(findUser(userId))
  if (
    Option.isNone(user) ||
    !user.value.confirmed ||
    user.value.organizationId !== null ||
    user.value.pendingOrganizationId === null
  ) {
    return "skipped" satisfies Outcome
  }
  const { email, pendingOrganizationId } = user.value
  const organization = yield* Effect.orDie(findOrganization(pendingOrganizationId))
  if (!matchesDomain(email, organization.domain)) {
    yield* Effect.logWarning("email domain no longer matches the requested organization")
    return "cancelled" satisfies Outcome
  }
  const domain = organization.domain!

  if (organization.verificationStatus === "pending") {
    if (organization.recentlyFailed) return "deferred" satisfies Outcome
    const registration = yield* registry.lookup(domain).pipe(
      Effect.tapError((error) =>
        Effect.orDie(sql`
          UPDATE organization
          SET registry_error = ${error.reason},
            registry_checked_at = (now() AT TIME ZONE 'utc'),
            updated_at = (now() AT TIME ZONE 'utc')
          WHERE id = ${organization.id} AND domain = ${domain} AND verification_status = 'pending'
        `),
      ),
    )
    const verified = yield* Effect.orDie(sql`
      UPDATE organization
      SET verification_status = 'verified',
        name = CASE WHEN name IS NULL OR name = domain::text THEN ${registration.name} ELSE name END,
        registry_name = ${registration.name},
        registry_source = ${registration.source},
        registry_checked_at = (now() AT TIME ZONE 'utc'),
        registry_error = NULL,
        updated_at = (now() AT TIME ZONE 'utc')
      WHERE id = ${organization.id} AND domain = ${domain} AND verification_status = 'pending'
      RETURNING id
    `)
    if (verified.length === 0) {
      return yield* new StaleRecord({ message: "the school changed during the registry lookup" })
    }
  }

  const activated = yield* Effect.orDie(
    activateMembership({ id: userId, email }, { id: organization.id, domain }),
  )
  if (!activated) {
    return yield* new StaleRecord({ message: "the membership changed during verification" })
  }
  return "activated" satisfies Outcome
})

/**
 * Puts the claimed job back, due in `deferral` seconds, without using up an attempt (like
 * Oban's snooze). The queue has no API for this, so it updates the store's row directly; the
 * store then finds the row no longer held by this worker and leaves it alone.
 */
const deferJob = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE ${sql(queueTable)}
      SET acquired_at = NULL, acquired_by = NULL, attempts = attempts - 1,
        visible_at = now() + interval '${sql.literal(String(deferral))} seconds', updated_at = now()
      WHERE queue_name = ${queueName} AND id = ${id} AND state = 'pending'
    `
  }).pipe(Effect.orDie)

/**
 * Takes the next due job and runs one attempt of it. A success completes the job, except for a
 * deferral; a failure is retried with backoff until the 20th attempt, then left failed.
 */
const processNext = SchoolVerificationQueue.use(({ queue }) =>
  Effect.flatMap(queue, (q) =>
    q.take(({ userId }, { id }) =>
      verifySchoolMembership(userId).pipe(
        Effect.timeout(attemptTimeout),
        Effect.tap((outcome) => (outcome === "deferred" ? deferJob(id) : Effect.void)),
        Effect.annotateLogs({ job: queueName, userId }),
      ),
    ),
  ),
)

/**
 * Runs jobs in the background for the app's lifetime. `JOB_WORKERS=false` turns it off; test
 * apps do, and drain the queue themselves.
 */
const worker = Layer.effectDiscard(
  Effect.gen(function* () {
    const enabled = yield* Config.Boolean("JOB_WORKERS").pipe(Config.withDefault(true))
    if (!enabled) return
    yield* processNext.pipe(
      // A failed attempt is retried by the queue; the pause keeps an outage from spinning.
      Effect.catchCause((cause) =>
        Effect.andThen(
          Effect.logWarning("School verification attempt failed", cause),
          Effect.sleep("1 second"),
        ),
      ),
      Effect.forever,
      Effect.forkScoped,
    )
  }),
)

export const SchoolVerification = { processNext, worker }
