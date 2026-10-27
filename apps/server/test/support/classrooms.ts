import type { RpcResult } from "@petitionu/domain"
import { Effect } from "effect"
import type { TestApp } from "./harness.ts"
import { createUser, type TestUser, uniqueEmail, type UserStage } from "./users.ts"

/** The data of a successful result; fails the test with the errors otherwise. */
export const ok = <A>(result: RpcResult<A>): Effect.Effect<A> =>
  result.success
    ? Effect.succeed(result.data)
    : Effect.die(new Error(`expected success: ${JSON.stringify(result.errors)}`))

/** The error types and messages of a failed result; fails the test on success. */
export const failure = <A>(result: RpcResult<A>) =>
  result.success
    ? Effect.die(new Error(`expected failure: ${JSON.stringify(result.data)}`))
    : Effect.succeed(result.errors)

interface MemberOptions {
  readonly organizationId?: string
  readonly stage?: UserStage
}

/**
 * A signed-in user on a campus of their own (a new verified organization for a unique
 * domain) unless `organizationId` is given. Complete profile unless `stage` says otherwise.
 */
const createMember =
  (app: TestApp, role: "student" | "professor" | "admin", names: object) =>
  (options: MemberOptions = {}) =>
    createUser(app, {
      role,
      email: uniqueEmail(`campus-${crypto.randomUUID().slice(0, 8)}.edu`),
      ...names,
      ...options,
    })

/** A signed-in professor named Pat Professor. */
export const createProfessor = (app: TestApp, options?: MemberOptions) =>
  createMember(app, "professor", { firstName: "Pat", lastName: "Professor" })(options)

/** A signed-in student named Test Member. */
export const createStudent = (app: TestApp, options?: MemberOptions) =>
  createMember(app, "student", { firstName: "Test", lastName: "Member" })(options)

/** Creates a classroom through `createClassroom`, as `professor`. */
export const createClassroom = (
  professor: TestUser,
  input: { readonly name?: string; readonly description?: string } = {},
) =>
  Effect.flatMap(
    professor.browser.rpc((api) => api.createClassroom({ name: input.name ?? "Civics", ...input })),
    ok,
  )

/**
 * Inserts a membership row directly, like `Ash.Seed` in the Elixir suites, for states the
 * procedures can't reach in one step.
 */
export const seedMembership = (
  app: TestApp,
  classroomId: string,
  userId: string,
  status: "pending" | "active" | "removed",
  role: "student" | "ta" = "student",
) =>
  Effect.gen(function* () {
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO classroom_memberships (classroom_id, user_id, status, role)
      VALUES (${classroomId}, ${userId}, ${status}, ${role})
      RETURNING id
    `
    return row!.id
  }).pipe(Effect.orDie)
