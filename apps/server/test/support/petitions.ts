import { Effect } from "effect"
import type { TestApp } from "./harness.ts"

/** Inserts a category (categories have no procedures for creating them). */
export const insertCategory = (
  app: TestApp,
  options: { readonly name?: string; readonly color?: string; readonly description?: string } = {},
) =>
  Effect.gen(function* () {
    const name = options.name ?? "Campus"
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO category (name, color, description)
      VALUES (${name}, ${options.color ?? "#00683d"}, ${options.description ?? null})
      RETURNING id
    `
    return { id: row!.id, name }
  }).pipe(Effect.orDie)

/**
 * Inserts a petition straight into the database (test setup, like `Ash.Seed`), bypassing
 * validation. Column names are the table's.
 */
export const insertPetition = (
  app: TestApp,
  options: {
    readonly userId: string
    readonly title?: string
    readonly description?: string
    readonly categoryId?: string | null
    readonly organizationId?: string | null
    readonly classroomId?: string | null
    readonly isAnonymous?: boolean
    readonly goal?: number
    readonly status?: "open" | "closed" | "victory"
  },
) =>
  Effect.gen(function* () {
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO petition (title, description, user_id, category_id, organization_id,
        classroom_id, is_anonymous, goal, status)
      VALUES (${options.title ?? "Library hours"}, ${options.description ?? "Keep it open"},
        ${options.userId}, ${options.categoryId ?? null}, ${options.organizationId ?? null},
        ${options.classroomId ?? null}, ${options.isAnonymous ?? false}, ${options.goal ?? 1000},
        ${options.status ?? "open"})
      RETURNING id
    `
    return { id: row!.id }
  }).pipe(Effect.orDie)

/** Changes petition columns directly, e.g. `{ hidden_at: new Date() }` (moderation is T12). */
export const updatePetitionRow = (
  app: TestApp,
  petitionId: string,
  columns: Record<string, unknown>,
) =>
  app.sql`UPDATE petition SET ${app.sql.update(columns as never)} WHERE id = ${petitionId}`.pipe(
    Effect.asVoid,
    Effect.orDie,
  )

/** Inserts a signature directly (signing through the API is T10). */
export const insertSignature = (
  app: TestApp,
  options: {
    readonly petitionId: string
    readonly userId: string
    readonly reason?: string
    readonly ipAddress?: string
    readonly userAgent?: string
  },
) =>
  app.sql`
    INSERT INTO signature (petition_id, user_id, reason, ip_address, user_agent, is_verified)
    VALUES (${options.petitionId}, ${options.userId}, ${options.reason ?? null},
      ${options.ipAddress ?? null}, ${options.userAgent ?? null}, true)
  `.pipe(Effect.asVoid, Effect.orDie)
