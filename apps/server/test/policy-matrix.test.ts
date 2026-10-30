/**
 * The policy matrix: every procedure, called as each actor type, against expectations taken
 * from the Ash policies (adjusted only where the rewrite made a recorded decision: sign-in for
 * classroom and activity reads, private preferences and notifications, `NotFound` for writes on
 * records the caller can't see, `Forbidden` for unconfirmed membership writes).
 *
 * The world: campus A (the classroom's campus), campus B and the superadmin's campus Z. On
 * campus A, the same-campus student owns the campus petition; the classroom student member owns
 * the classroom petition. Records the cells read but no actor owns belong to a bystander.
 */
import { assert, layer } from "@effect/vitest"
import { type ApiClient, AppRpcs, type RpcResult } from "@petitionu/domain"
import { Context, Effect, Layer } from "effect"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { insertClassroom, seedMembership, upsertMembership } from "./support/classrooms.ts"
import { makeTestApp, type TestApp } from "./support/harness.ts"
import { insertCategory, insertPetition, insertSignature } from "./support/petitions.ts"
import { createOrganization, createUser, uniqueEmail } from "./support/users.ts"

const actorNames = [
  "guest",
  "unconfirmed",
  "incomplete",
  "sameCampus",
  "otherCampus",
  "member",
  "ta",
  "professor",
  "admin",
  "otherAdmin",
  "superadmin",
] as const
type ActorName = (typeof actorNames)[number]

/** `hidden`: `NotFound`, or a list that doesn't include the target. */
type Outcome = "ok" | "hidden" | "unauthenticated" | "forbidden" | "invalid"

interface Actor {
  readonly name: ActorName
  readonly id: string | undefined
  readonly browser: Browser
}

const insertUser = (app: TestApp, organizationId: string) =>
  Effect.gen(function* () {
    const email = uniqueEmail("campus-a.edu")
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO users (email, confirmed_at, email_verified, first_name, last_name,
        organization_id)
      VALUES (${email}, now(), true, 'Bea', 'Bystander', ${organizationId})
      RETURNING id
    `
    return { id: row!.id, email }
  }).pipe(Effect.orDie)

const makeWorld = Effect.gen(function* () {
  const app = yield* makeTestApp()
  const campusA = yield* createOrganization(app, { name: "Campus A", domain: "campus-a.edu" })
  const campusB = yield* createOrganization(app, { name: "Campus B", domain: "campus-b.edu" })
  const campusZ = yield* createOrganization(app, { name: "Campus Z", domain: "campus-z.edu" })
  const at = (domain: string) => uniqueEmail(domain)
  const users = {
    unconfirmed: yield* createUser(app, { stage: "unconfirmed", email: at("campus-a.edu") }),
    incomplete: yield* createUser(app, { stage: "confirmed", email: at("incomplete.edu") }),
    sameCampus: yield* createUser(app, { email: at("campus-a.edu"), organizationId: campusA.id }),
    otherCampus: yield* createUser(app, { email: at("campus-b.edu"), organizationId: campusB.id }),
    member: yield* createUser(app, { email: at("campus-a.edu"), organizationId: campusA.id }),
    ta: yield* createUser(app, { email: at("campus-a.edu"), organizationId: campusA.id }),
    professor: yield* createUser(app, {
      email: at("campus-a.edu"),
      organizationId: campusA.id,
      role: "professor",
    }),
    admin: yield* createUser(app, {
      email: at("campus-a.edu"),
      organizationId: campusA.id,
      role: "admin",
    }),
    otherAdmin: yield* createUser(app, {
      email: at("campus-b.edu"),
      organizationId: campusB.id,
      role: "admin",
    }),
    superadmin: yield* createUser(app, {
      email: at("campus-z.edu"),
      organizationId: campusZ.id,
      role: "superadmin",
    }),
  }
  const actors: ReadonlyArray<Actor> = [
    { name: "guest", id: undefined, browser: yield* makeBrowser(app) },
    ...Object.entries(users).map(([name, user]) => ({
      name: name as ActorName,
      id: user.id,
      browser: user.browser,
    })),
  ]
  const bystander = yield* insertUser(app, campusA.id)
  const category = yield* insertCategory(app)
  const classroom = yield* insertClassroom(app, {
    professorId: users.professor.id,
    organizationId: campusA.id,
  })
  const membershipId = yield* seedMembership(app, classroom.id, users.member.id, "active")
  yield* seedMembership(app, classroom.id, users.ta.id, "active", "ta")
  const pendingId = yield* seedMembership(app, classroom.id, bystander.id, "pending")

  const campusPetition = yield* insertPetition(app, {
    userId: users.sameCampus.id,
    organizationId: campusA.id,
    categoryId: category.id,
  })
  const classroomPetition = yield* insertPetition(app, {
    userId: users.member.id,
    organizationId: campusA.id,
    classroomId: classroom.id,
    categoryId: category.id,
  })
  const activity: Record<"campus" | "classroom", Record<string, string>> = {
    campus: {},
    classroom: {},
  }
  for (const [key, petition] of [
    ["campus", campusPetition],
    ["classroom", classroomPetition],
  ] as const) {
    yield* insertSignature(app, { petitionId: petition.id, userId: bystander.id })
    const [signature] = yield* app.sql<{ id: string }>`
      SELECT id FROM signature WHERE petition_id = ${petition.id}`.pipe(Effect.orDie)
    const [comment] = yield* app.sql<{ id: string }>`
      INSERT INTO comment (text, user_id, petition_id)
      VALUES ('Agreed', ${bystander.id}, ${petition.id}) RETURNING id`.pipe(Effect.orDie)
    const [update] = yield* app.sql<{ id: string }>`
      INSERT INTO update (title, body, petition_id)
      VALUES ('News', 'Progress', ${petition.id}) RETURNING id`.pipe(Effect.orDie)
    activity[key] = { signature: signature!.id, comment: comment!.id, update: update!.id }
  }

  const supportRequest = yield* users.sameCampus.browser.rpc((api) =>
    api.createSupportRequest({ kind: "support", message: "Help" }),
  )
  if (!supportRequest.success) return yield* Effect.die(supportRequest.errors)

  return {
    app,
    campusA,
    users,
    actors,
    category,
    classroom,
    membershipId,
    pendingId,
    campusPetition,
    classroomPetition,
    activity,
    supportRequestId: supportRequest.data.id,
    insertUser: () => insertUser(app, campusA.id),
  }
})

class World extends Context.Service<World, Effect.Success<typeof makeWorld>>()("PolicyWorld") {}

type WorldShape = World["Service"]

const outcomeOf: Record<string, Outcome> = {
  not_found: "hidden",
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  invalid: "invalid",
}

/** The outcome of a call: `ok`, or its first error (unexpected errors fail the test). */
const outcome = <A>(result: RpcResult<A>): Effect.Effect<Outcome> => {
  if (result.success) return Effect.succeed("ok")
  const error = result.errors[0]!
  const mapped = outcomeOf[error.type]
  return mapped ? Effect.succeed(mapped) : Effect.die(new Error(JSON.stringify(result.errors)))
}

/** `ok` when the list includes `id`, `hidden` when it doesn't. */
const listed = <A extends { readonly id: string }>(
  result: RpcResult<ReadonlyArray<A>>,
  id: string,
): Effect.Effect<Outcome> =>
  result.success
    ? Effect.succeed(result.data.some((row) => row.id === id) ? "ok" : "hidden")
    : outcome(result)

type Cell = (world: WorldShape, actor: Actor) => Effect.Effect<Outcome>

const call =
  <A>(f: (api: ApiClient, world: WorldShape, actor: Actor) => Promise<RpcResult<A>>): Cell =>
  (world, actor) =>
    Effect.flatMap(
      actor.browser.rpc((api) => f(api, world, actor)),
      outcome,
    )

const lists =
  <A extends { readonly id: string }>(
    f: (api: ApiClient, world: WorldShape) => Promise<RpcResult<ReadonlyArray<A>>>,
    target: (world: WorldShape) => string,
  ): Cell =>
  (world, actor) =>
    Effect.flatMap(
      actor.browser.rpc((api) => f(api, world)),
      (result) => listed(result, target(world)),
    )

/** Runs `f` against a target made fresh for each actor. */
const fresh =
  <T>(
    setup: (world: WorldShape) => Effect.Effect<T>,
    f: (api: ApiClient, target: T) => Promise<RpcResult<unknown>>,
  ): Cell =>
  (world, actor) =>
    Effect.gen(function* () {
      const target = yield* setup(world)
      return yield* outcome(yield* actor.browser.rpc((api) => f(api, target)))
    })

const expected = (
  base: Outcome,
  overrides: Partial<Record<ActorName, Outcome>> = {},
): Record<ActorName, Outcome> => ({
  ...(Object.fromEntries(actorNames.map((name) => [name, base])) as Record<ActorName, Outcome>),
  ...overrides,
})

/** Guests are told to sign in; everyone else gets `base` unless overridden. */
const signedIn = (base: Outcome, overrides: Partial<Record<ActorName, Outcome>> = {}) =>
  expected(base, { guest: "unauthenticated", ...overrides })

const insiders = { member: "ok", ta: "ok", professor: "ok" } as const
/** Only the classroom's professor and active members may see it. */
const classroomOnly = signedIn("hidden", insiders)
/** Participation needs a confirmed user with a complete profile. */
const participants = signedIn("ok", { unconfirmed: "invalid", incomplete: "invalid" })
/** Participation in the classroom: insiders only; others can't find the classroom petition. */
const classroomParticipants = signedIn("invalid", insiders)
/** Operators of the record's campus (A) and superadmins, plus the record's owner. */
const operatorsAndOwner = signedIn("hidden", { sameCampus: "ok", admin: "ok", superadmin: "ok" })
const operatorsOnly = signedIn("hidden", { sameCampus: "forbidden", admin: "ok", superadmin: "ok" })
/**
 * A payload its schema rejects, such as a malformed id: `invalid` for everyone, guests included,
 * because the shared client rejects it before the call.
 */
const rejectedPayload = expected("invalid")
const malformedId = "not-a-uuid"

const petitionInput = (world: WorldShape) => ({
  title: "Longer library hours",
  description: "Open the library until midnight",
  goal: 100,
  categoryId: world.category.id,
})

const freshCampusPetition = (world: WorldShape) =>
  insertPetition(world.app, {
    userId: world.users.sameCampus.id,
    organizationId: world.campusA.id,
    categoryId: world.category.id,
  })

const freshClassroomPetition = (world: WorldShape) =>
  insertPetition(world.app, {
    userId: world.users.member.id,
    organizationId: world.campusA.id,
    classroomId: world.classroom.id,
    categoryId: world.category.id,
  })

/** A classroom taught by the professor, with the member and the TA. */
const freshClassroom = (archived: boolean) => (world: WorldShape) =>
  Effect.gen(function* () {
    const classroom = yield* insertClassroom(world.app, {
      professorId: world.users.professor.id,
      organizationId: world.campusA.id,
      archived,
    })
    yield* upsertMembership(world.app, { classroomId: classroom.id, userId: world.users.member.id })
    yield* upsertMembership(world.app, {
      classroomId: classroom.id,
      userId: world.users.ta.id,
      role: "ta",
    })
    return classroom
  })

/** A classroom nobody in the matrix belongs to. */
const joinableClassroom = (world: WorldShape) =>
  Effect.flatMap(world.insertUser(), (teacher) =>
    insertClassroom(world.app, { professorId: teacher.id, organizationId: world.campusA.id }),
  )

/** A membership of the world's classroom, held by a new user. */
const freshMembership = (status: "pending" | "active") => (world: WorldShape) =>
  Effect.flatMap(world.insertUser(), (user) =>
    seedMembership(world.app, world.classroom.id, user.id, status),
  )

const freshReport = (world: WorldShape) =>
  Effect.gen(function* () {
    const petition = yield* freshCampusPetition(world)
    const result = yield* world.users.sameCampus.browser.rpc((api) =>
      api.createContentReport({ petitionId: petition.id, reason: "spam" }),
    )
    return result.success ? result.data.id : yield* Effect.die(result.errors)
  })

const freshSupportRequest = (world: WorldShape) =>
  Effect.gen(function* () {
    const result = yield* world.users.sameCampus.browser.rpc((api) =>
      api.createSupportRequest({ kind: "support", message: "Help" }),
    )
    return result.success ? result.data.id : yield* Effect.die(result.errors)
  })

/** Withdraws the actor's signature from a fresh petition they've signed (guests sign nothing). */
const signedFresh =
  (setup: (world: WorldShape) => Effect.Effect<{ readonly id: string }>): Cell =>
  (world, actor) =>
    Effect.gen(function* () {
      const petition = yield* setup(world)
      if (actor.id) yield* insertSignature(world.app, { petitionId: petition.id, userId: actor.id })
      return yield* outcome(
        yield* actor.browser.rpc((api) => api.deleteSignature({ petitionId: petition.id })),
      )
    })

/**
 * Changes a fresh comment on a fresh petition: the actor's own (seeded, so guests have none and
 * get a bystander's) or a bystander's.
 */
const commentFresh =
  (
    setup: (world: WorldShape) => Effect.Effect<{ readonly id: string }>,
    owner: "actor" | "bystander",
    change: (api: ApiClient, id: string) => Promise<RpcResult<unknown>>,
  ): Cell =>
  (world, actor) =>
    Effect.gen(function* () {
      const petition = yield* setup(world)
      const userId = owner === "actor" && actor.id ? actor.id : (yield* world.insertUser()).id
      const [comment] = yield* world.app.sql<{ id: string }>`
        INSERT INTO comment (text, user_id, petition_id)
        VALUES ('Mine', ${userId}, ${petition.id}) RETURNING id`.pipe(Effect.orDie)
      return yield* outcome(yield* actor.browser.rpc((api) => change(api, comment!.id)))
    })

type Row = readonly [name: string, expected: Record<ActorName, Outcome>, cell: Cell]

const rows: ReadonlyArray<Row> = [
  // Accounts and campus
  ["getMe", expected("ok", { guest: "hidden" }), call((api) => api.getMe())],
  [
    // `AssignCampus`: confirmed users only, and only into an approved or verified campus (the
    // incomplete user's school is still pending).
    "updateMyProfile",
    participants,
    call((api) => api.updateMyProfile({ firstName: "Ada", lastName: "Lovelace" })),
  ],
  ["getOrganizations", expected("ok"), call((api) => api.getOrganizations())],

  // Users
  [
    "getUserById (a campus A student)",
    expected("hidden", { sameCampus: "ok", admin: "ok", superadmin: "ok" }),
    call((api, world) => api.getUserById({ id: world.users.sameCampus.id })),
  ],
  [
    "getUsers (includes a campus A student)",
    expected("hidden", { sameCampus: "ok", admin: "ok", superadmin: "ok" }),
    lists(
      (api) => api.getUsers(),
      (world) => world.users.sameCampus.id,
    ),
  ],
  [
    "setUserRole (a campus A student to professor)",
    signedIn("hidden", { admin: "ok", superadmin: "ok" }),
    fresh(
      (world) => world.insertUser(),
      (api, user) => api.setUserRole({ id: user.id, role: "professor" }),
    ),
  ],
  [
    "setUserRole (granting superadmin to a campus A student)",
    signedIn("hidden", { admin: "invalid", superadmin: "ok" }),
    fresh(
      (world) => world.insertUser(),
      (api, user) => api.setUserRole({ id: user.id, role: "superadmin" }),
    ),
  ],
  [
    "setUserRole (a campus A superadmin to student)",
    signedIn("hidden", { admin: "forbidden", superadmin: "ok" }),
    fresh(
      (world) =>
        Effect.tap(world.insertUser(), (user) =>
          world.app.sql`UPDATE users SET role = 'superadmin' WHERE id = ${user.id}`.pipe(
            Effect.orDie,
          ),
        ),
      (api, user) => api.setUserRole({ id: user.id, role: "student" }),
    ),
  ],
  [
    "setUserRole (a malformed id)",
    rejectedPayload,
    call((api) => api.setUserRole({ id: malformedId, role: "professor" })),
  ],
  ["getPreferences", signedIn("ok"), call((api) => api.getPreferences())],
  ["getNotifications", signedIn("ok"), call((api) => api.getNotifications())],

  // Support
  [
    "createSupportRequest",
    signedIn("ok"),
    call((api) => api.createSupportRequest({ kind: "support", message: "Help" })),
  ],
  ["getMySupportRequests", signedIn("ok"), call((api) => api.getMySupportRequests())],
  [
    "getSupportRequests (includes a campus A student's request)",
    operatorsAndOwner,
    lists(
      (api) => api.getSupportRequests({}),
      (world) => world.supportRequestId,
    ),
  ],
  [
    "resolveSupportRequest (a campus A student's request)",
    operatorsOnly,
    fresh(freshSupportRequest, (api, id) =>
      api.resolveSupportRequest({ id, resolutionNote: "Done" }),
    ),
  ],
  ["supportContact", expected("ok"), call((api) => api.supportContact())],

  // Petitions
  ["getCategories", expected("ok"), call((api) => api.getCategories())],
  [
    "getPetitions (includes the campus petition)",
    signedIn("ok"),
    lists(
      (api) => api.getPetitions({}),
      (world) => world.campusPetition.id,
    ),
  ],
  [
    "getPetitions (includes the classroom petition)",
    classroomOnly,
    lists(
      (api) => api.getPetitions({}),
      (world) => world.classroomPetition.id,
    ),
  ],
  [
    "getPublicPetitions (includes the campus petition)",
    signedIn("ok"),
    lists(
      (api) => api.getPublicPetitions(),
      (world) => world.campusPetition.id,
    ),
  ],
  [
    "getPetitionById (the campus petition)",
    expected("ok"),
    call((api, world) => api.getPetitionById({ id: world.campusPetition.id })),
  ],
  [
    "getPetitionById (the classroom petition)",
    expected("hidden", insiders),
    call((api, world) => api.getPetitionById({ id: world.classroomPetition.id })),
  ],
  [
    "getClassroomPetitions (includes the classroom petition)",
    classroomOnly,
    lists(
      (api, world) => api.getClassroomPetitions({ classroomId: world.classroom.id }),
      (world) => world.classroomPetition.id,
    ),
  ],
  ["createPetition", participants, call((api, world) => api.createPetition(petitionInput(world)))],
  [
    "createClassroomPetition",
    classroomParticipants,
    call((api, world) =>
      api.createClassroomPetition({ ...petitionInput(world), classroomId: world.classroom.id }),
    ),
  ],
  [
    "updatePetition (the campus petition)",
    signedIn("forbidden", { sameCampus: "ok" }),
    call((api, world) => api.updatePetition({ id: world.campusPetition.id, goal: 100 })),
  ],
  [
    "updatePetition (the classroom petition)",
    signedIn("hidden", { member: "ok", professor: "ok", ta: "forbidden" }),
    call((api, world) => api.updatePetition({ id: world.classroomPetition.id, goal: 100 })),
  ],
  [
    "closePetition (a campus petition)",
    signedIn("forbidden", { sameCampus: "ok" }),
    fresh(freshCampusPetition, (api, petition) => api.closePetition({ id: petition.id })),
  ],
  [
    "closePetition (a classroom petition)",
    signedIn("hidden", { member: "ok", professor: "ok", ta: "forbidden" }),
    fresh(freshClassroomPetition, (api, petition) => api.closePetition({ id: petition.id })),
  ],
  [
    "markPetitionVictory (a campus petition)",
    signedIn("forbidden", { sameCampus: "ok" }),
    fresh(freshCampusPetition, (api, petition) => api.markPetitionVictory({ id: petition.id })),
  ],
  [
    "markPetitionVictory (a classroom petition)",
    signedIn("hidden", { member: "ok", professor: "ok", ta: "forbidden" }),
    fresh(freshClassroomPetition, (api, petition) => api.markPetitionVictory({ id: petition.id })),
  ],
  [
    "getPetitionById (a malformed id)",
    rejectedPayload,
    call((api) => api.getPetitionById({ id: malformedId })),
  ],
  [
    "updatePetition (a malformed id)",
    rejectedPayload,
    call((api) => api.updatePetition({ id: malformedId, goal: 100 })),
  ],
  [
    "createPetition (a blank title)",
    rejectedPayload,
    call((api, world) => api.createPetition({ ...petitionInput(world), title: " " })),
  ],

  // Signatures, comments, updates
  [
    "createSignature (a campus A petition)",
    signedIn("ok", {
      unconfirmed: "invalid",
      incomplete: "invalid",
      otherCampus: "invalid",
      otherAdmin: "invalid",
      superadmin: "invalid",
    }),
    fresh(freshCampusPetition, (api, petition) => api.createSignature({ petitionId: petition.id })),
  ],
  [
    "createSignature (a classroom petition)",
    classroomParticipants,
    fresh(freshClassroomPetition, (api, petition) =>
      api.createSignature({ petitionId: petition.id }),
    ),
  ],
  [
    // Seeded for every actor, so the cell tests withdrawing, not whether they could sign.
    "deleteSignature (their own, on a campus A petition)",
    participants,
    signedFresh(freshCampusPetition),
  ],
  [
    "deleteSignature (their own, on a classroom petition)",
    classroomParticipants,
    signedFresh(freshClassroomPetition),
  ],
  [
    // Only the caller's own signature can go: a bystander's stays.
    "deleteSignature (a campus A petition only a bystander signed)",
    signedIn("invalid"),
    fresh(
      (world) =>
        Effect.gen(function* () {
          const petition = yield* freshCampusPetition(world)
          const bystander = yield* world.insertUser()
          yield* insertSignature(world.app, { petitionId: petition.id, userId: bystander.id })
          return petition
        }),
      (api, petition) => api.deleteSignature({ petitionId: petition.id }),
    ),
  ],
  ...(
    [
      ["updateComment", (api, id) => api.updateComment({ id, text: "Edited" })],
      ["deleteComment", (api, id) => api.deleteComment({ id })],
    ] as const satisfies ReadonlyArray<
      readonly [string, (api: ApiClient, id: string) => Promise<RpcResult<unknown>>]
    >
  ).flatMap(([name, change]): ReadonlyArray<Row> => [
    // Ash's comment update and destroy policy: the author, while they can still read it.
    [
      `${name} (their own, on a campus A petition)`,
      signedIn("ok"),
      commentFresh(freshCampusPetition, "actor", change),
    ],
    [
      `${name} (their own, on a classroom petition)`,
      classroomOnly,
      commentFresh(freshClassroomPetition, "actor", change),
    ],
    [
      `${name} (a bystander's, on a campus A petition)`,
      signedIn("forbidden"),
      commentFresh(freshCampusPetition, "bystander", change),
    ],
    [
      `${name} (a bystander's, on a classroom petition)`,
      signedIn("hidden", { member: "forbidden", ta: "forbidden", professor: "forbidden" }),
      commentFresh(freshClassroomPetition, "bystander", change),
    ],
  ]),
  ...(["campus", "classroom"] as const).flatMap((key): ReadonlyArray<Row> => {
    const reads = key === "campus" ? signedIn("ok") : classroomOnly
    const petitionId = (world: WorldShape) =>
      (key === "campus" ? world.campusPetition : world.classroomPetition).id
    return [
      [
        `getSignatures (the ${key} petition)`,
        reads,
        lists(
          (api, world) => api.getSignatures({ petitionId: petitionId(world) }),
          (world) => world.activity[key]!.signature!,
        ),
      ],
      [
        `getComments (the ${key} petition)`,
        reads,
        lists(
          (api, world) => api.getComments({ petitionId: petitionId(world) }),
          (world) => world.activity[key]!.comment!,
        ),
      ],
      [
        `getUpdates (the ${key} petition)`,
        reads,
        lists(
          (api, world) => api.getUpdates({ petitionId: petitionId(world) }),
          (world) => world.activity[key]!.update!,
        ),
      ],
      [
        `getUpdatesForPetition (the ${key} petition)`,
        reads,
        lists(
          (api, world) => api.getUpdatesForPetition({ petitionId: petitionId(world) }),
          (world) => world.activity[key]!.update!,
        ),
      ],
      [
        `createComment (the ${key} petition)`,
        key === "campus" ? participants : classroomParticipants,
        call((api, world) => api.createComment({ petitionId: petitionId(world), text: "Yes" })),
      ],
      [
        `createUpdate (the ${key} petition)`,
        key === "campus"
          ? signedIn("invalid", { sameCampus: "ok" })
          : signedIn("invalid", { member: "ok", professor: "ok" }),
        call((api, world) =>
          api.createUpdate({ petitionId: petitionId(world), title: "News", body: "More news" }),
        ),
      ],
    ]
  }),

  [
    "createSignature (a malformed petition id)",
    rejectedPayload,
    call((api) => api.createSignature({ petitionId: malformedId })),
  ],
  [
    "createComment (a blank comment)",
    rejectedPayload,
    call((api, world) => api.createComment({ petitionId: world.campusPetition.id, text: " " })),
  ],
  [
    "deleteComment (a malformed id)",
    rejectedPayload,
    call((api) => api.deleteComment({ id: malformedId })),
  ],

  // Classrooms
  [
    "getClassrooms (includes the classroom)",
    classroomOnly,
    lists(
      (api) => api.getClassrooms(),
      (world) => world.classroom.id,
    ),
  ],
  [
    "getMyClassrooms (includes the classroom)",
    classroomOnly,
    lists(
      (api) =>
        api
          .getMyClassrooms({})
          .then((result) => (result.success ? { ...result, data: result.data.results } : result)),
      (world) => world.classroom.id,
    ),
  ],
  [
    "getClassroomById",
    classroomOnly,
    call((api, world) => api.getClassroomById({ id: world.classroom.id })),
  ],
  [
    "createClassroom",
    signedIn("forbidden", { professor: "ok", admin: "ok", otherAdmin: "ok" }),
    call((api) => api.createClassroom({ name: "Civics" })),
  ],
  [
    "updateClassroom",
    signedIn("hidden", { professor: "ok", member: "forbidden", ta: "forbidden" }),
    call((api, world) => api.updateClassroom({ id: world.classroom.id, name: "Test classroom" })),
  ],
  [
    "regenerateJoinCode",
    signedIn("hidden", { professor: "ok", member: "forbidden", ta: "forbidden" }),
    fresh(freshClassroom(false), (api, classroom) => api.regenerateJoinCode({ id: classroom.id })),
  ],
  [
    "archiveClassroom",
    signedIn("hidden", { professor: "ok", member: "forbidden", ta: "forbidden" }),
    fresh(freshClassroom(false), (api, classroom) => api.archiveClassroom({ id: classroom.id })),
  ],
  [
    "unarchiveClassroom",
    signedIn("hidden", { professor: "ok", member: "forbidden", ta: "forbidden" }),
    fresh(freshClassroom(true), (api, classroom) => api.unarchiveClassroom({ id: classroom.id })),
  ],
  [
    "getClassroomMemberships (includes the member's membership)",
    classroomOnly,
    lists(
      (api) => api.getClassroomMemberships(),
      (world) => world.membershipId,
    ),
  ],
  [
    "getMembershipsForClassroom (includes the member's membership)",
    classroomOnly,
    lists(
      (api, world) => api.getMembershipsForClassroom({ classroomId: world.classroom.id }),
      (world) => world.membershipId,
    ),
  ],
  [
    "getPendingMemberships (includes a pending request)",
    signedIn("hidden", { ta: "ok", professor: "ok" }),
    lists(
      (api, world) => api.getPendingMemberships({ classroomId: world.classroom.id }),
      (world) => world.pendingId,
    ),
  ],
  [
    "joinClassroomByCode",
    signedIn("ok", { unconfirmed: "forbidden" }),
    fresh(joinableClassroom, (api, classroom) =>
      api.joinClassroomByCode({ joinCode: classroom.joinCode }),
    ),
  ],
  [
    "requestToJoinClassroom",
    signedIn("ok", { unconfirmed: "forbidden" }),
    fresh(joinableClassroom, (api, classroom) =>
      api.requestToJoinClassroom({ classroomId: classroom.id }),
    ),
  ],
  [
    // A create: Ash checks the classroom without reading it first, so outsiders get Forbidden.
    "inviteToClassroom (as a student)",
    signedIn("forbidden", {
      ta: "ok",
      professor: "ok",
    }),
    (world, actor) =>
      fresh(
        () => world.insertUser(),
        (api, user) =>
          api.inviteToClassroom({ classroomId: world.classroom.id, email: user.email }),
      )(world, actor),
  ],
  [
    "inviteToClassroom (as a TA)",
    signedIn("forbidden", { professor: "ok" }),
    (world, actor) =>
      fresh(
        () => world.insertUser(),
        (api, user) =>
          api.inviteToClassroom({ classroomId: world.classroom.id, email: user.email, role: "ta" }),
      )(world, actor),
  ],
  [
    "approveMembership (a pending request)",
    signedIn("hidden", { unconfirmed: "forbidden", ta: "ok", professor: "ok" }),
    fresh(freshMembership("pending"), (api, id) => api.approveMembership({ id })),
  ],
  [
    "approveMembership (a pending request in an archived classroom)",
    signedIn("hidden", { unconfirmed: "forbidden", ta: "forbidden", professor: "forbidden" }),
    fresh(
      (world) =>
        Effect.gen(function* () {
          const classroom = yield* freshClassroom(true)(world)
          const user = yield* world.insertUser()
          return yield* seedMembership(world.app, classroom.id, user.id, "pending")
        }),
      (api, id) => api.approveMembership({ id }),
    ),
  ],
  [
    "approveMembership (an active membership)",
    signedIn("hidden", { unconfirmed: "forbidden", ta: "forbidden", professor: "forbidden" }),
    fresh(freshMembership("active"), (api, id) => api.approveMembership({ id })),
  ],
  [
    "removeFromClassroom (the caller's own active student membership)",
    signedIn("ok", { unconfirmed: "forbidden" }),
    (world, actor) =>
      actor.id === undefined
        ? call((api) => api.removeFromClassroom({ id: world.membershipId }))(world, actor)
        : fresh(
            (world) =>
              Effect.gen(function* () {
                const classroom = yield* joinableClassroom(world)
                return yield* seedMembership(world.app, classroom.id, actor.id!, "active")
              }),
            (api, id) => api.removeFromClassroom({ id }),
          )(world, actor),
  ],
  [
    "removeFromClassroom (an active student)",
    signedIn("hidden", { unconfirmed: "forbidden", ta: "ok", professor: "ok" }),
    fresh(freshMembership("active"), (api, id) => api.removeFromClassroom({ id })),
  ],
  [
    "promoteToTa (an active student)",
    signedIn("hidden", { unconfirmed: "forbidden", ta: "forbidden", professor: "ok" }),
    fresh(freshMembership("active"), (api, id) => api.promoteToTa({ id })),
  ],
  [
    "demoteToStudent (an active student)",
    signedIn("hidden", { unconfirmed: "forbidden", ta: "forbidden", professor: "ok" }),
    fresh(freshMembership("active"), (api, id) => api.demoteToStudent({ id })),
  ],

  [
    "getMembershipsForClassroom (a malformed classroom id)",
    rejectedPayload,
    call((api) => api.getMembershipsForClassroom({ classroomId: malformedId })),
  ],
  [
    "approveMembership (a malformed id)",
    rejectedPayload,
    call((api) => api.approveMembership({ id: malformedId })),
  ],
  [
    "createClassroom (a blank name)",
    rejectedPayload,
    call((api) => api.createClassroom({ name: " " })),
  ],

  // Moderation
  [
    "createContentReport (a campus petition)",
    participants,
    fresh(freshCampusPetition, (api, petition) =>
      api.createContentReport({ petitionId: petition.id, reason: "spam" }),
    ),
  ],
  [
    "getContentReports (includes a campus A student's report)",
    operatorsAndOwner,
    (world, actor) =>
      Effect.gen(function* () {
        const id = yield* freshReport(world)
        return yield* listed(yield* actor.browser.rpc((api) => api.getContentReports({})), id)
      }),
  ],
  [
    // Hiding: superadmins, or admins of the content's campus.
    "resolveContentReport (hiding a campus A petition)",
    operatorsOnly,
    fresh(freshReport, (api, id) =>
      api.resolveContentReport({
        id,
        outcome: "resolved",
        hideContent: true,
        resolutionNote: "Hidden",
      }),
    ),
  ],
  [
    "resolveContentReport (a campus A student's report)",
    operatorsOnly,
    fresh(freshReport, (api, id) =>
      api.resolveContentReport({ id, outcome: "dismissed", resolutionNote: "Fine" }),
    ),
  ],
  [
    "resolveContentReport (a malformed id)",
    rejectedPayload,
    call((api) =>
      api.resolveContentReport({ id: malformedId, outcome: "dismissed", resolutionNote: "Fine" }),
    ),
  ],
  [
    // The reported ids stay loose: a malformed one is unavailable content, after sign-in.
    "createContentReport (a malformed petition id)",
    signedIn("invalid"),
    call((api) => api.createContentReport({ petitionId: malformedId, reason: "spam" })),
  ],
]

layer(Layer.effect(World, makeWorld), { excludeTestServices: true, timeout: "120 seconds" })(
  "policy matrix",
  (it) => {
    for (const [name, want, cell] of rows) {
      it.effect(name, () =>
        Effect.gen(function* () {
          const world = yield* World
          const got: Partial<Record<ActorName, Outcome>> = {}
          for (const actor of world.actors) got[actor.name] = yield* cell(world, actor)
          assert.deepStrictEqual(got, want)
        }),
      )
    }

    it.effect("covers every procedure", () =>
      Effect.sync(() => {
        const covered = new Set(rows.map(([name]) => name.split(" ")[0]))
        assert.deepStrictEqual([...covered].sort(), [...AppRpcs.requests.keys()].sort())
      }),
    )
  },
)
