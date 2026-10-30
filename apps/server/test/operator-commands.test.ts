import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  magicSignIn,
  me,
  organizationsAt,
  pendingOrganizationOf,
  schoolDomain,
} from "./support/campus.ts"
import { dropDatabase, makeTestApp, type TestApp } from "./support/harness.ts"
import { type Jobs, makeJobsApp } from "./support/jobs.ts"
import { runConcurrently, runOperator } from "./support/operator.ts"
import { createUser, emailsTo, uniqueEmail } from "./support/users.ts"

const userCount = (app: TestApp) =>
  app.sql<{ count: number }>`SELECT count(*)::int AS count FROM users`.pipe(
    Effect.map((rows) => rows[0]!.count),
    Effect.orDie,
  )

const superadminCount = (app: TestApp) =>
  app.sql<{ count: number }>`
    SELECT count(*)::int AS count FROM users WHERE role = 'superadmin'
  `.pipe(
    Effect.map((rows) => rows[0]!.count),
    Effect.orDie,
  )

/** A confirmed student waiting for a pending school at `domain`. */
const waitingUser = (app: TestApp, domain = schoolDomain()) =>
  Effect.gen(function* () {
    const user = yield* createUser(app, { stage: "confirmed", email: uniqueEmail(domain) })
    return { user, domain, organizationId: (yield* pendingOrganizationOf(app, user.id))! }
  })

/** Lets the user's job fail all 20 attempts, leaving it failed and the school's check recent. */
const exhaustJob = (app: TestApp, jobs: Jobs) =>
  Effect.gen(function* () {
    yield* app.registry.script("unavailable")
    for (let attempt = 0; attempt < 20; attempt++) {
      yield* jobs.elapse("1 day")
      yield* jobs.drain
    }
  })

describe("operator entry point", () => {
  it.live("lists the commands without needing a database", () =>
    Effect.gen(function* () {
      const help = yield* runOperator({ url: "" }, "--help")
      assert.strictEqual(help.code, 0, help.stderr)
      for (const command of ["approve-organization", "set-role", "retry-verification"]) {
        assert.include(help.stdout, command)
      }
    }),
  )

  it.live("exits non-zero on bad arguments and when the database is unreachable", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      assert.notStrictEqual((yield* runOperator(app.database, "nope")).code, 0)
      assert.notStrictEqual(
        (yield* runOperator(app.database, "set-role", "a@example.edu", "owner")).code,
        0,
      )
      yield* dropDatabase(app.database.name)
      const down = yield* runOperator(app.database, "set-role", "a@example.edu", "admin")
      assert.notStrictEqual(down.code, 0)
      assert.notStrictEqual(down.stderr, "")
    }),
  )
})

describe("approve-organization", () => {
  it.live(
    "approves a pending school and activates users whose jobs are failed or still queued",
    () =>
      Effect.gen(function* () {
        const { app, jobs } = yield* makeJobsApp()
        const failed = yield* waitingUser(app)
        yield* exhaustJob(app, jobs)
        assert.deepStrictEqual(yield* jobs.allJobsFor(failed.user.id), ["failed"])
        const queued = yield* waitingUser(app, failed.domain)
        const before = yield* emailsTo(app, queued.user.email)

        const result = yield* runOperator(app.database, "approve-organization", failed.domain)

        assert.strictEqual(result.code, 0, result.stderr)
        assert.include(result.stdout, "pending -> approved")
        assert.include(result.stdout, "Activated 2 waiting user(s)")
        assert.include(result.stdout, failed.user.email)
        assert.include(result.stdout, queued.user.email)
        const [organization] = yield* organizationsAt(app, failed.domain)
        assert.strictEqual(organization!.verificationStatus, "approved")
        // The name stays as it was; approval doesn't claim a registry match.
        assert.strictEqual(organization!.name, failed.domain)
        for (const { user } of [failed, queued]) {
          assert.strictEqual((yield* me(user.browser)).organizationId, failed.organizationId)
          assert.isNull(yield* pendingOrganizationOf(app, user.id))
        }
        // No notice goes out, as with the job's activation.
        assert.strictEqual(yield* emailsTo(app, queued.user.email), before)

        // The queued job finds nothing left to do and never asks the registry.
        const lookups = (yield* app.registry.lookups).length
        assert.deepStrictEqual(yield* jobs.drain, ["skipped"])
        assert.lengthOf(yield* app.registry.lookups, lookups)

        // New confirmations join directly.
        const later = yield* createUser(app, {
          stage: "confirmed",
          email: uniqueEmail(failed.domain),
        })
        assert.strictEqual((yield* me(later.browser)).organizationId, failed.organizationId)
      }),
  )

  it.live("leaves users whose email is outside the domain waiting", () =>
    Effect.gen(function* () {
      const { app } = yield* makeJobsApp()
      const matching = yield* waitingUser(app)
      const moved = yield* waitingUser(app, matching.domain)
      const elsewhere = uniqueEmail(schoolDomain())
      yield* app.sql`UPDATE users SET email = ${elsewhere} WHERE id = ${moved.user.id}`.pipe(
        Effect.orDie,
      )

      const result = yield* runOperator(app.database, "approve-organization", matching.domain)

      assert.strictEqual(result.code, 0, result.stderr)
      assert.include(result.stdout, "Activated 1 waiting user(s)")
      assert.include(
        result.stdout,
        `Left 1 user(s) waiting, email outside the domain: ${elsewhere}`,
      )
      assert.strictEqual(yield* pendingOrganizationOf(app, moved.user.id), moved.organizationId)
    }),
  )

  it.live("finds the organization by id or by domain in any case", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const byCase = yield* waitingUser(app)
      const result = yield* runOperator(
        app.database,
        "approve-organization",
        byCase.domain.toUpperCase(),
      )
      assert.strictEqual(result.code, 0, result.stderr)
      const byId = yield* waitingUser(app)
      const second = yield* runOperator(app.database, "approve-organization", byId.organizationId)
      assert.strictEqual(second.code, 0, second.stderr)
      assert.include(second.stdout, "pending -> approved")
    }),
  )

  it.live("keeps a verified school's status, still activates stragglers, and can be repeated", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const { user, domain, organizationId } = yield* waitingUser(app)
      yield* app.sql`
        UPDATE organization SET verification_status = 'verified' WHERE id = ${organizationId}
      `.pipe(Effect.orDie)

      const first = yield* runOperator(app.database, "approve-organization", domain)
      assert.strictEqual(first.code, 0, first.stderr)
      assert.include(first.stdout, "already verified")
      assert.include(first.stdout, "Activated 1 waiting user(s)")
      assert.strictEqual((yield* me(user.browser)).organizationId, organizationId)
      assert.strictEqual((yield* organizationsAt(app, domain))[0]!.verificationStatus, "verified")

      const again = yield* runOperator(app.database, "approve-organization", domain)
      assert.strictEqual(again.code, 0, again.stderr)
      assert.include(again.stdout, "Activated 0 waiting user(s)")
    }),
  )

  it.live("refuses an organization that doesn't exist", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const domain = schoolDomain()
      const result = yield* runOperator(app.database, "approve-organization", domain)
      assert.notStrictEqual(result.code, 0)
      assert.include(result.stderr, `No organization matches ${domain}`)
      assert.lengthOf(yield* organizationsAt(app, domain), 0)
    }),
  )
})

describe("set-role", () => {
  it.live("bootstraps the first superadmin on a system with no users", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      assert.strictEqual(yield* userCount(app), 0)
      const email = "Founder@Example.com"

      const result = yield* runOperator(app.database, "set-role", email, "superadmin", "--create")

      assert.strictEqual(result.code, 0, result.stderr)
      assert.include(result.stdout, "Created founder@example.com")
      assert.include(result.stdout, "role superadmin")

      const { browser, me: account } = yield* magicSignIn(app, email.toLowerCase())
      assert.strictEqual(account.role, "superadmin")
      assert.isTrue(account.emailVerified)

      const other = yield* createUser(app, { stage: "confirmed" })
      const promoted = yield* browser.rpc((api) =>
        api.setUserRole({ id: other.id, role: "superadmin" }),
      )
      assert.isTrue(promoted.success, JSON.stringify(promoted))
    }),
  )

  it.live("makes a campus-less user the first superadmin, with no superadmin to authorize it", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const operator = yield* createUser(app, {
        stage: "confirmed",
        email: uniqueEmail("gmail.com"),
      })
      const student = yield* createUser(app)
      const before = yield* operator.browser.rpc((api) => api.getUsers())
      assert.isTrue(before.success && before.data.length === 1)

      const result = yield* runOperator(app.database, "set-role", operator.email, "superadmin")

      assert.strictEqual(result.code, 0, result.stderr)
      assert.include(result.stdout, `Set role of ${operator.email}`)
      assert.include(result.stdout, "student -> superadmin")
      assert.strictEqual((yield* me(operator.browser)).role, "superadmin")
      const after = yield* operator.browser.rpc((api) => api.getUsers())
      assert.isTrue(after.success && after.data.some((user) => user.id === student.id))
    }),
  )

  it.live("sets any role by email or id", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { role: "admin" })
      const byId = yield* runOperator(app.database, "set-role", user.id, "professor")
      assert.strictEqual(byId.code, 0, byId.stderr)
      assert.include(byId.stdout, "admin -> professor")
      assert.strictEqual((yield* me(user.browser)).role, "professor")

      const byEmail = yield* runOperator(
        app.database,
        "set-role",
        user.email.toUpperCase(),
        "student",
      )
      assert.strictEqual(byEmail.code, 0, byEmail.stderr)
      assert.strictEqual((yield* me(user.browser)).role, "student")
    }),
  )

  it.live("demotes a superadmin while another remains", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { role: "superadmin" })
      yield* createUser(app, { role: "superadmin" })

      const result = yield* runOperator(app.database, "set-role", user.email, "student")

      assert.strictEqual(result.code, 0, result.stderr)
      assert.include(result.stdout, "superadmin -> student")
      assert.strictEqual(yield* superadminCount(app), 1)
    }),
  )

  it.live("won't demote the last superadmin without --force", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { role: "superadmin" })

      const refused = yield* runOperator(app.database, "set-role", user.email, "admin")
      assert.notStrictEqual(refused.code, 0)
      assert.include(refused.stderr, "last superadmin")
      assert.include(refused.stderr, "--force")
      assert.strictEqual((yield* me(user.browser)).role, "superadmin")

      const forced = yield* runOperator(app.database, "set-role", user.email, "admin", "--force")
      assert.strictEqual(forced.code, 0, forced.stderr)
      assert.include(forced.stdout, "superadmin -> admin")
      assert.include(forced.stdout, "no superadmin")
      assert.strictEqual(yield* superadminCount(app), 0)
    }),
  )

  it.live("--force doesn't excuse granting a role to an unconfirmed account", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const squatter = yield* createUser(app, { stage: "unconfirmed" })
      const result = yield* runOperator(
        app.database,
        "set-role",
        squatter.email,
        "superadmin",
        "--force",
      )
      assert.notStrictEqual(result.code, 0)
      assert.include(result.stderr, "hasn't confirmed their email")
    }),
  )

  it.live("lets only one of two concurrent demotions take the last-but-one superadmin", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const first = yield* createUser(app, { role: "superadmin" })
      const second = yield* createUser(app, { role: "superadmin" })
      for (let round = 0; round < 5; round++) {
        yield* app.sql`
          UPDATE users SET role = 'superadmin' WHERE id IN (${first.id}, ${second.id})
        `.pipe(Effect.orDie)

        const results = yield* runConcurrently(2, (index) =>
          runOperator(app.database, "set-role", [first, second][index]!.email, "student"),
        )

        assert.strictEqual(yield* superadminCount(app), 1, JSON.stringify(results))
        const refused = results.filter((result) => result.code !== 0)
        assert.lengthOf(refused, 1, JSON.stringify(results))
        assert.include(refused[0]!.stderr, "last superadmin")
      }
    }),
  )

  it.live("reports an unchanged role and exits 0", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app)
      const result = yield* runOperator(app.database, "set-role", user.email, "student")
      assert.strictEqual(result.code, 0, result.stderr)
      assert.include(result.stdout, "already has role student")
    }),
  )

  it.live("refuses a user who doesn't exist unless told to create them", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const email = uniqueEmail()
      const result = yield* runOperator(app.database, "set-role", email, "admin")
      assert.notStrictEqual(result.code, 0)
      assert.include(result.stderr, `No user matches ${email}`)
      assert.strictEqual(yield* userCount(app), 0)
    }),
  )

  it.live("--create takes any address sign-up would, personal hosts included", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const result = yield* runOperator(
        app.database,
        "set-role",
        "founder@gmail.com",
        "superadmin",
        "--create",
      )
      assert.strictEqual(result.code, 0, result.stderr)
      const { me: account } = yield* magicSignIn(app, "founder@gmail.com")
      assert.strictEqual(account.role, "superadmin")
    }),
  )

  it.live("--create refuses anything that isn't an email address", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      for (const target of [
        "a b@school.edu",
        "<x>@school.edu",
        "founder",
        "a@b@school.edu",
        "founder@school",
        crypto.randomUUID(),
      ]) {
        const result = yield* runOperator(app.database, "set-role", target, "admin", "--create")
        assert.notStrictEqual(result.code, 0, target)
        assert.include(result.stderr, "--create needs a valid email address", target)
      }
      assert.strictEqual(yield* userCount(app), 0)
    }),
  )

  it.live("--create refuses once any user exists, even for that user", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const existing = yield* createUser(app)
      for (const target of ["typo@schoool.edu", existing.email]) {
        const result = yield* runOperator(
          app.database,
          "set-role",
          target,
          "superadmin",
          "--create",
        )
        assert.notStrictEqual(result.code, 0, target)
        assert.include(result.stderr, "--create is only for a system with no users", target)
      }
      assert.strictEqual(yield* userCount(app), 1)
      assert.strictEqual((yield* me(existing.browser)).role, "student")
    }),
  )

  it.live("lets only one of several concurrent --create runs make the first user", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const results = yield* runConcurrently(6, (index) =>
        runOperator(app.database, "set-role", `first${index}@gmail.com`, "superadmin", "--create"),
      )
      assert.strictEqual(yield* userCount(app), 1, JSON.stringify(results))
      const refused = results.filter((result) => result.code !== 0)
      assert.lengthOf(refused, 5, JSON.stringify(results))
      for (const result of refused) {
        assert.include(result.stderr, "--create is only for a system with no users")
      }
    }),
  )

  it.live("won't grant admin or superadmin to an unconfirmed account", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const squatter = yield* createUser(app, { stage: "unconfirmed" })
      for (const role of ["admin", "superadmin"]) {
        const result = yield* runOperator(app.database, "set-role", squatter.email, role)
        assert.notStrictEqual(result.code, 0)
        assert.include(result.stderr, "hasn't confirmed their email")
      }
      assert.strictEqual((yield* me(squatter.browser)).role, "student")

      const professor = yield* runOperator(app.database, "set-role", squatter.email, "professor")
      assert.strictEqual(professor.code, 0, professor.stderr)
    }),
  )
})

describe("retry-verification", () => {
  it.live("queues a fresh job for a failed one, which then activates the user", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user, organizationId } = yield* waitingUser(app)
      yield* exhaustJob(app, jobs)
      yield* app.registry.script(() => ({ name: "Registry University", source: "test-registry" }))
      yield* jobs.elapse("1 day")
      assert.deepStrictEqual(yield* jobs.drain, [])

      const result = yield* runOperator(app.database, "retry-verification", user.email)

      assert.strictEqual(result.code, 0, result.stderr)
      assert.include(result.stdout, `Queued verification job`)
      assert.include(result.stdout, "failed after 20 attempt(s)")
      assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed", "pending"])

      assert.deepStrictEqual(yield* jobs.drain, ["activated"])
      assert.strictEqual((yield* me(user.browser)).organizationId, organizationId)
      assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed", "completed"])
    }),
  )

  it.live(
    "a retried job that defers stays queued, and a retry can itself fail and be retried",
    () =>
      Effect.gen(function* () {
        const { app, jobs } = yield* makeJobsApp()
        const { user } = yield* waitingUser(app)
        yield* exhaustJob(app, jobs)
        const lookups = (yield* app.registry.lookups).length

        // The school's last lookup just failed, so the retry waits rather than asking again.
        const first = yield* runOperator(app.database, "retry-verification", user.id)
        assert.strictEqual(first.code, 0, first.stderr)
        assert.deepStrictEqual(yield* jobs.drain, ["deferred"])
        assert.lengthOf(yield* app.registry.lookups, lookups)
        assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed", "pending"])

        const whileQueued = yield* runOperator(app.database, "retry-verification", user.email)
        assert.notStrictEqual(whileQueued.code, 0)
        assert.include(whileQueued.stderr, "has a job that is pending, not failed")
        assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed", "pending"])

        yield* exhaustJob(app, jobs)
        assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed", "failed"])
        const second = yield* runOperator(app.database, "retry-verification", user.email)
        assert.strictEqual(second.code, 0, second.stderr)
        assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed", "failed", "pending"])
      }),
  )

  it.live("finishes on a single-connection pool", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user } = yield* waitingUser(app)
      yield* exhaustJob(app, jobs)

      const result = yield* runOperator(
        { url: app.database.url, env: { POOL_SIZE: "1" } },
        "retry-verification",
        user.email,
      )

      assert.strictEqual(result.code, 0, result.stderr)
      assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed", "pending"])
    }),
  )

  it.live("the other commands finish on a single-connection pool too", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const onePool = { url: app.database.url, env: { POOL_SIZE: "1" } }
      const first = yield* runOperator(onePool, "set-role", "one@gmail.com", "admin", "--create")
      assert.strictEqual(first.code, 0, first.stderr)
      const { domain } = yield* waitingUser(app)
      const approved = yield* runOperator(onePool, "approve-organization", domain)
      assert.strictEqual(approved.code, 0, approved.stderr)
      const user = yield* createUser(app, { role: "superadmin" })
      const demoted = yield* runOperator(onePool, "set-role", user.email, "student", "--force")
      assert.strictEqual(demoted.code, 0, demoted.stderr)
    }),
  )

  it.live("refuses when there's nothing to retry", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const expectRefused = (target: string, reason: string) =>
        Effect.gen(function* () {
          const result = yield* runOperator(app.database, "retry-verification", target)
          assert.notStrictEqual(result.code, 0)
          assert.include(result.stderr, reason)
        })

      yield* expectRefused(uniqueEmail(), "No user matches")

      const queued = yield* waitingUser(app)
      yield* expectRefused(queued.user.email, "has a job that is pending, not failed")

      yield* jobs.drain
      yield* expectRefused(queued.user.email, "already belongs to an organization")

      const personal = yield* createUser(app, {
        stage: "confirmed",
        email: uniqueEmail("gmail.com"),
      })
      yield* expectRefused(personal.email, "isn't waiting for a school")

      const jobless = yield* waitingUser(app)
      yield* app.sql`DELETE FROM job_queue WHERE id = ${jobless.user.id}`.pipe(Effect.orDie)
      yield* expectRefused(jobless.user.email, "has no verification job")
    }),
  )

  it.live("refuses a user the job has already activated after a failure", () =>
    Effect.gen(function* () {
      const { app, jobs } = yield* makeJobsApp()
      const { user, domain } = yield* waitingUser(app)
      yield* exhaustJob(app, jobs)
      const approved = yield* runOperator(app.database, "approve-organization", domain)
      assert.strictEqual(approved.code, 0, approved.stderr)

      const result = yield* runOperator(app.database, "retry-verification", user.email)
      assert.notStrictEqual(result.code, 0)
      assert.include(result.stderr, "already belongs to an organization")
      assert.deepStrictEqual(yield* jobs.allJobsFor(user.id), ["failed"])
    }),
  )
})
