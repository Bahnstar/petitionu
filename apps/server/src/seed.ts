/**
 * `seed` entry point for development: fills an empty, migrated database with a campus, a
 * few accounts, petitions with signatures, comments and updates, a classroom, and open
 * moderation and support items. Every account signs in with `SEED_PASSWORD`.
 *
 * Usage: `DATABASE_URL=... bun run seed` (from the repository root or `apps/server`).
 * Refuses to run in production, and does nothing when the seed accounts already exist.
 */
import { NodeRuntime } from "@effect/platform-node"
import bcrypt from "bcryptjs"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AppConfig } from "./Config.ts"
import { DatabaseLive } from "./Database.ts"
import { ObservabilityLive } from "./Logging.ts"

const SEED_PASSWORD = "petitionu-dev-password"

const accounts = {
  student: { email: "student@example.edu", firstName: "Sam", lastName: "Rivera", role: "student" },
  classmate: { email: "classmate@example.edu", firstName: "Jo", lastName: "Chen", role: "student" },
  professor: {
    email: "professor@example.edu",
    firstName: "Pat",
    lastName: "Okafor",
    role: "professor",
  },
  admin: { email: "admin@example.edu", firstName: "Alex", lastName: "Morgan", role: "admin" },
} as const

const days = (count: number) => new Date(Date.now() + count * 86_400_000)

const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const existing = yield* sql<{ id: string }>`
    SELECT id FROM users WHERE email = ${accounts.student.email}
  `
  if (existing.length > 0) {
    yield* Effect.logInfo("Seed accounts already exist; nothing to do")
    return
  }

  const [campus] = yield* sql<{ id: string }>`
    INSERT INTO organization (name, domain, description, verification_status, allow_public_signatures)
    VALUES ('Example State University', 'example.edu', 'A campus for local development.',
      'verified', false)
    ON CONFLICT (domain) DO UPDATE SET verification_status = 'verified'
    RETURNING id
  `
  const organizationId = campus!.id

  const hash = yield* Effect.promise(() => bcrypt.hash(SEED_PASSWORD, 12))
  const users: Record<keyof typeof accounts, string> = {} as never
  for (const [key, account] of Object.entries(accounts) as Array<
    [keyof typeof accounts, (typeof accounts)[keyof typeof accounts]]
  >) {
    const [user] = yield* sql<{ id: string }>`
      INSERT INTO users (email, first_name, last_name, name, role, organization_id,
        graduation_year, confirmed_at, email_verified)
      VALUES (${account.email}, ${account.firstName}, ${account.lastName},
        ${`${account.firstName} ${account.lastName}`}, ${account.role}, ${organizationId},
        ${account.role === "student" ? 2028 : null}, now() AT TIME ZONE 'utc', true)
      RETURNING id
    `
    yield* sql`
      INSERT INTO account (account_id, provider_id, user_id, password)
      VALUES (${user!.id}, 'credential', ${user!.id}, ${hash})
    `
    users[key] = user!.id
  }

  const categoryIds: Record<string, string> = {}
  for (const [name, color] of [
    ["Campus life", "#00683d"],
    ["Academics", "#3d5a99"],
    ["Sustainability", "#5c7d2e"],
    ["Dining", "#a4542b"],
  ] as const) {
    const [row] = yield* sql<{ id: string }>`
      INSERT INTO category (name, color) VALUES (${name}, ${color}) RETURNING id
    `
    categoryIds[name] = row!.id
  }

  const insertPetition = (petition: {
    readonly author: string
    readonly title: string
    readonly description: string
    readonly category: string
    readonly goal: number
    readonly deadline?: Date
    readonly status?: "open" | "closed" | "victory"
    readonly isAnonymous?: boolean
    readonly classroomId?: string
    readonly age: number
  }) =>
    sql<{ id: string }>`
      INSERT INTO petition (title, description, user_id, category_id, organization_id,
        classroom_id, goal, deadline, status, is_anonymous, inserted_at)
      VALUES (${petition.title}, ${petition.description}, ${petition.author},
        ${categoryIds[petition.category]!}, ${organizationId}, ${petition.classroomId ?? null},
        ${petition.goal}, ${petition.deadline ?? null}, ${petition.status ?? "open"},
        ${petition.isAnonymous ?? false},
        (now() AT TIME ZONE 'utc') - make_interval(days => ${petition.age}))
      RETURNING id
    `.pipe(Effect.map(([row]) => row!.id))

  const library = yield* insertPetition({
    author: users.student,
    title: "Keep the library open until 2 a.m. during finals",
    description:
      "During finals week the library closes at midnight, right when study groups get going. " +
      "Staying open two more hours would give everyone a quiet, safe place to work.",
    category: "Academics",
    goal: 150,
    deadline: days(21),
    age: 6,
  })
  const bikes = yield* insertPetition({
    author: users.classmate,
    title: "Covered bike parking by the science buildings",
    description: "Bikes left outside the labs rust through the winter. A covered rack would help.",
    category: "Sustainability",
    goal: 80,
    age: 3,
  })
  const dining = yield* insertPetition({
    author: users.classmate,
    title: "Late-night vegetarian options at the dining hall",
    description: "After 9 p.m. the only hot meal is a burger. Add one vegetarian dish to the menu.",
    category: "Dining",
    goal: 60,
    isAnonymous: true,
    deadline: days(9),
    age: 12,
  })
  yield* insertPetition({
    author: users.student,
    title: "Free printing credits for every student",
    description: "Twenty free pages a week would cover readings and assignments for most courses.",
    category: "Campus life",
    goal: 40,
    status: "victory",
    age: 40,
  })
  yield* insertPetition({
    author: users.classmate,
    title: "Water refill stations in every dorm",
    description: "Only two dorms have refill stations. Every building should have one.",
    category: "Sustainability",
    goal: 120,
    status: "closed",
    age: 60,
  })

  const [classroom] = yield* sql<{ id: string }>`
    INSERT INTO classrooms (name, description, join_code, professor_id, organization_id)
    VALUES ('Civic Design 101', 'Proposals for a better campus, one petition at a time.',
      gen_random_uuid(), ${users.professor}, ${organizationId})
    RETURNING id
  `
  const classroomId = classroom!.id
  yield* sql`
    INSERT INTO classroom_memberships (classroom_id, user_id, role, status, joined_at)
    VALUES (${classroomId}, ${users.student}, 'student', 'active', now() AT TIME ZONE 'utc'),
      (${classroomId}, ${users.classmate}, 'student', 'pending', null)
  `
  const studySpaces = yield* insertPetition({
    author: users.student,
    title: "Bookable study rooms for project teams",
    description: "Group projects need rooms with whiteboards that teams can reserve in advance.",
    category: "Academics",
    goal: 25,
    classroomId,
    age: 2,
  })
  yield* insertPetition({
    author: users.professor,
    title: "Publish course syllabi before registration",
    description: "Students should see each course's workload before they sign up for it.",
    category: "Academics",
    goal: 30,
    classroomId,
    age: 1,
  })

  const signatures: ReadonlyArray<readonly [string, string, string | null]> = [
    [library, users.classmate, "I study best late at night and the dorms are loud."],
    [library, users.professor, null],
    [library, users.admin, "Finals are stressful enough without a curfew."],
    [bikes, users.student, "My bike chain rusted last winter."],
    [dining, users.student, null],
    [studySpaces, users.professor, "Teams need space to meet."],
  ]
  for (const [petitionId, userId, reason] of signatures) {
    yield* sql`
      INSERT INTO signature (petition_id, user_id, reason, is_verified)
      VALUES (${petitionId}, ${userId}, ${reason}, true)
    `
  }

  yield* sql`
    INSERT INTO comment (petition_id, user_id, text)
    VALUES (${library}, ${users.classmate}, 'Could the cafe stay open too? Coffee helps.'),
      (${library}, ${users.admin}, 'Facilities is reviewing staffing for finals week.')
  `
  const [spam] = yield* sql<{ id: string }>`
    INSERT INTO comment (petition_id, user_id, text)
    VALUES (${bikes}, ${users.student}, 'Buy cheap bikes here: totally-not-spam.example')
    RETURNING id
  `
  yield* sql`
    INSERT INTO update (petition_id, title, body)
    VALUES (${library}, 'Meeting with the library director',
      'We meet with the director next Tuesday to present the signatures so far.')
  `

  yield* sql`
    INSERT INTO content_reports (petition_id, comment_id, organization_id, reporter_id,
      target_title, target_text, reason, details)
    VALUES (${bikes}, ${spam!.id}, ${organizationId}, ${users.classmate},
      'Covered bike parking by the science buildings',
      'Buy cheap bikes here: totally-not-spam.example', 'spam', 'Looks like an advertisement.'),
      (${dining}, null, ${organizationId}, ${users.student},
      'Late-night vegetarian options at the dining hall',
      'After 9 p.m. the only hot meal is a burger. Add one vegetarian dish to the menu.',
      'other', 'Duplicate of an older petition?')
  `
  yield* sql`
    INSERT INTO support_requests (user_id, organization_id, requester_email, kind, message)
    VALUES (${users.student}, ${organizationId}, ${accounts.student.email}, 'support',
      'I signed a petition by mistake. Can it be removed?')
  `
  yield* Effect.logInfo("Seeded the development database", {
    accounts: Object.values(accounts).map((account) => account.email),
    password: SEED_PASSWORD,
  })
})

const guarded = Effect.gen(function* () {
  if (process.env.NODE_ENV === "production") {
    return yield* Effect.die(new Error("Refusing to seed a production database"))
  }
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(seed)
})

guarded.pipe(
  Effect.provide(DatabaseLive),
  Effect.provide(AppConfig.layer({ webDistDir: "", publicHostUnused: true })),
  Effect.provide(ObservabilityLive),
  NodeRuntime.runMain,
)
