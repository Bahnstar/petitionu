import { EmailDomain, isUuid, Role } from "@petitionu/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import {
  activateMembership,
  matchesDomain,
  SchoolVerificationQueue,
  verificationJobs,
} from "./SchoolVerification.ts"
import { writeUserRole } from "./Users.ts"

/*
 * What the `operator` entry point runs. There is no actor here: whoever can run these already
 * holds the database credentials, so the only rules are the ones that protect the data. Each
 * command works in one transaction and returns the lines to print once it has committed.
 */

/** A command refused: the message says why, and nothing was changed. */
export class OperatorError extends Schema.TaggedError<OperatorError>()("OperatorError", {
  message: Schema.String,
}) {}

const UserRow = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: Role,
  organizationId: Schema.NullOr(Schema.String),
  pendingOrganizationId: Schema.NullOr(Schema.String),
  confirmed: Schema.Boolean,
})

const OrganizationRow = Schema.Struct({
  id: Schema.String,
  domain: Schema.NullOr(Schema.String),
  verificationStatus: Schema.String,
})

/** Locks and returns the user a command names, by email or id. */
const findUser = Effect.fnUntraced(function* (target: string) {
  const sql = yield* SqlClient.SqlClient
  return yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: UserRow,
    execute: (value) => sql`
      SELECT id, email::text AS email, role, organization_id, pending_organization_id,
        confirmed_at IS NOT NULL AS confirmed
      FROM users WHERE ${isUuid(value) ? sql`id = ${value}` : sql`email = ${value}`}
      FOR UPDATE
    `,
  })(target)
})

const noUser = (target: string) => new OperatorError({ message: `No user matches ${target}.` })

const describeUser = (user: { readonly id: string; readonly email: string }) =>
  `${user.email} (${user.id})`

/**
 * Sets an organization's status to `approved` (a pending one; verified and approved ones keep
 * theirs) and moves its waiting users in. Approval alone would strand them: a job that has
 * failed never runs again, and sign-ins don't look at the membership. Users whose email no
 * longer matches the domain stay waiting, as the job leaves them.
 */
export const approveOrganization = Effect.fn("approveOrganization")(function* (target: string) {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const found = yield* SqlSchema.findOneOption({
        Request: Schema.String,
        Result: OrganizationRow,
        execute: (value) => sql`
          SELECT id, domain::text AS domain, verification_status FROM organization
          WHERE ${isUuid(value) ? sql`id = ${value}` : sql`domain = ${value}`}
          FOR UPDATE
        `,
      })(target)
      if (Option.isNone(found)) {
        return yield* new OperatorError({ message: `No organization matches ${target}.` })
      }
      const organization = found.value
      const label = `${organization.domain ?? "(no domain)"} (${organization.id})`

      const pending = organization.verificationStatus === "pending"
      if (pending) {
        yield* sql`
          UPDATE organization
          SET verification_status = 'approved', updated_at = (now() AT TIME ZONE 'utc')
          WHERE id = ${organization.id}
        `
      }

      const waiting = yield* sql<{ id: string; email: string }>`
        SELECT id, email::text AS email FROM users
        WHERE pending_organization_id = ${organization.id} AND organization_id IS NULL
          AND confirmed_at IS NOT NULL
        ORDER BY inserted_at, id
        FOR UPDATE
      `
      const activated: Array<string> = []
      const left: Array<string> = []
      for (const user of waiting) {
        const moved =
          organization.domain !== null &&
          matchesDomain(user.email, organization.domain) &&
          (yield* activateMembership(user, { id: organization.id, domain: organization.domain }))
        ;(moved ? activated : left).push(user.email)
      }

      return [
        pending
          ? `Approved ${label}: pending -> approved`
          : `${label} is already ${organization.verificationStatus}; status unchanged`,
        `Activated ${activated.length} waiting user(s)${activated.length > 0 ? `: ${activated.join(", ")}` : ""}`,
        ...(left.length > 0
          ? [`Left ${left.length} user(s) waiting, email outside the domain: ${left.join(", ")}`]
          : []),
      ]
    }),
  )
})

/**
 * Sets a user's role, whoever holds which role today, so this is how the first superadmin gets
 * made. `create` adds the account first when there is none, for a system without users.
 *
 * Sign-up doesn't prove the address, and an unconfirmed account can already sign in, so someone
 * who registered the operator's address first would receive the role. `admin` and `superadmin`
 * therefore need a confirmed account. A created account has no password: the first magic-link
 * or password-reset sign-in proves the address and confirms it.
 */
export const setRole = Effect.fn("setRole")(function* (options: {
  readonly target: string
  readonly role: Role
  readonly create: boolean
}) {
  const { target, role, create } = options
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const found = yield* findUser(target)
      if (Option.isNone(found)) {
        if (!create) return yield* noUser(target)
        if (EmailDomain.fromEmail(target) === undefined) {
          return yield* new OperatorError({
            message: `--create needs an email address, not ${target}.`,
          })
        }
        const email = target.toLowerCase()
        const [created] = yield* sql<{ id: string }>`
          INSERT INTO users (email, role) VALUES (${email}, ${role}) RETURNING id
        `
        return [
          `Created ${describeUser({ id: created!.id, email })} with role ${role}`,
          "Sign in with an emailed magic link or password reset to confirm the account.",
        ]
      }
      const user = found.value
      if (user.role === role) return [`${describeUser(user)} already has role ${role}; unchanged`]
      if ((role === "admin" || role === "superadmin") && !user.confirmed) {
        return yield* new OperatorError({
          message: `${user.email} hasn't confirmed their email; confirm it before granting ${role}.`,
        })
      }
      yield* writeUserRole(sql, user.id, role)
      return [`Set role of ${describeUser(user)}: ${user.role} -> ${role}`]
    }),
  )
})

/**
 * Queues a new verification job, with fresh attempts, for a waiting user whose last job failed.
 * Only offers through the queue; reading the jobs is the one direct use of its table. The old
 * job stays as the failure's record. A worker in the running app picks the new one up.
 */
export const retryVerification = Effect.fn("retryVerification")(function* (target: string) {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const found = yield* findUser(target)
      if (Option.isNone(found)) return yield* noUser(target)
      const user = found.value
      const refuse = (reason: string) =>
        new OperatorError({ message: `${user.email} ${reason}; nothing to retry.` })

      if (user.organizationId !== null) return yield* refuse("already belongs to an organization")
      if (user.pendingOrganizationId === null) return yield* refuse("isn't waiting for a school")
      const job = (yield* verificationJobs(user.id)).at(-1)
      if (job === undefined) return yield* refuse("has no verification job")
      if (job.state !== "failed") return yield* refuse(`has a job that is ${job.state}, not failed`)

      const id = yield* SchoolVerificationQueue.requeue(user.id)
      return [
        `Queued verification job ${id} for ${describeUser(user)}`,
        `Previous job ${job.id} failed after ${job.attempts} attempt(s): ${job.lastFailure?.split("\n")[0] ?? "no failure recorded"}`,
      ]
    }),
  )
})
