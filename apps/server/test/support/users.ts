import type { Role } from "@petitionu/domain"
import { Effect } from "effect"
import { type Browser, makeBrowser } from "./browser.ts"
import { linksIn } from "./external.ts"
import type { TestApp } from "./harness.ts"

export const defaultPassword = "correct horse battery"

let nextUser = 1

/** A unique address at `domain`. */
export const uniqueEmail = (domain = "example.edu") =>
  `user${nextUser++}-${crypto.randomUUID().slice(0, 8)}@${domain}`

export interface TestUser {
  readonly id: string
  readonly email: string
  readonly password: string
  /** A browser signed in as this user, with a CSRF token for the session. */
  readonly browser: Browser
}

const fail = (message: string, detail: unknown) =>
  Effect.die(new Error(`${message}: ${JSON.stringify(detail)}`))

/** The token from the last link emailed to `email` (confirmation, magic link or reset). */
export const lastEmailedToken = (app: TestApp, email: string) =>
  Effect.map(app.mailer.lastLinkTo(email), (url) => url.searchParams.get("token")!)

const sentTo = (app: TestApp, to: string) =>
  Effect.map(app.mailer.messages, (messages) => messages.filter((message) => message.to === to))

/**
 * Runs `action`, then waits for the email it sends to `to` (auth emails go out in the
 * background). Returns the action's result, the email, its link and the link's token.
 */
export const withEmailTo = <A, E, R>(app: TestApp, to: string, action: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const before = (yield* sentTo(app, to)).length
    const result = yield* action
    for (let attempt = 0; attempt < 100; attempt++) {
      const messages = yield* sentTo(app, to)
      if (messages.length > before) {
        const email = messages.at(-1)!
        const link = new URL(linksIn(email)[0]!)
        return { result, email, link, token: link.searchParams.get("token")! }
      }
      yield* Effect.sleep("20 millis")
    }
    return yield* Effect.die(new Error(`no email sent to ${to}`))
  })

/** How many emails have been sent to `to`, after letting background sends finish. */
export const emailsTo = (app: TestApp, to: string) =>
  Effect.andThen(
    Effect.sleep("100 millis"),
    Effect.map(sentTo(app, to), (sent) => sent.length),
  )

/** Registers through the real sign-up endpoint; the new user is unconfirmed and signed in. */
export const registerUser = (
  app: TestApp,
  options: { readonly email?: string; readonly password?: string } = {},
) =>
  Effect.gen(function* () {
    const email = options.email ?? uniqueEmail()
    const password = options.password ?? defaultPassword
    const browser = yield* makeBrowser(app)
    const { result: response } = yield* withEmailTo(
      app,
      email,
      browser.auth("/sign-up/email", { email, password, passwordConfirmation: password, name: "" }),
    )
    if (response.status !== 200) return yield* fail("sign-up failed", response)
    yield* browser.reloadCsrf
    return { id: response.body.user.id as string, email, password, browser } satisfies TestUser
  })

/** Clicks Confirm on the page the last confirmation email links to. */
export const confirmEmail = (app: TestApp, browser: Browser, email: string) =>
  Effect.gen(function* () {
    const token = yield* lastEmailedToken(app, email)
    const response = yield* browser.authGet(`/verify-email?token=${encodeURIComponent(token)}`)
    if (response.status !== 200) return yield* fail("confirmation failed", response)
    yield* browser.reloadCsrf
  })

/** Signs in through the real endpoint in a new browser. */
export const signIn = (app: TestApp, email: string, password = defaultPassword) =>
  Effect.gen(function* () {
    const browser = yield* makeBrowser(app)
    const response = yield* browser.auth("/sign-in/email", { email, password })
    if (response.status !== 200) return yield* fail("sign-in failed", response)
    yield* browser.reloadCsrf
    return browser
  })

/** Creates a verified organization for `domain`. */
export const createOrganization = (
  app: TestApp,
  options: { readonly name?: string; readonly domain?: string } = {},
) =>
  Effect.gen(function* () {
    const [row] = yield* app.sql<{ id: string }>`
      INSERT INTO organization (name, domain, verification_status)
      VALUES (${options.name ?? "Test University"}, ${options.domain ?? "example.edu"}, 'verified')
      RETURNING id
    `
    return { id: row!.id, name: options.name ?? "Test University" }
  }).pipe(Effect.orDie)

export type UserStage = "unconfirmed" | "confirmed" | "complete"

/**
 * Creates a signed-in user at `stage`, through the real auth endpoints:
 * - `unconfirmed`: registered, email not confirmed;
 * - `confirmed`: confirmed by clicking the emailed link;
 * - `complete`: confirmed, with first and last name and an organization (a new verified one
 *   for the email's domain unless `organizationId` is given).
 * `role` sets the user's role (default `student`).
 */
export const createUser = (
  app: TestApp,
  options: {
    readonly stage?: UserStage
    readonly role?: Role
    readonly email?: string
    readonly organizationId?: string
    readonly firstName?: string
    readonly lastName?: string
  } = {},
) =>
  Effect.gen(function* () {
    const stage = options.stage ?? "complete"
    const user = yield* registerUser(app, options.email ? { email: options.email } : {})
    if (stage !== "unconfirmed") yield* confirmEmail(app, user.browser, user.email)
    if (stage === "complete") {
      const organizationId =
        options.organizationId ??
        (yield* createOrganization(app, { domain: user.email.split("@")[1]! })).id
      yield* app.sql`
        UPDATE users SET first_name = ${options.firstName ?? "Test"},
          last_name = ${options.lastName ?? "Student"}, organization_id = ${organizationId}
        WHERE id = ${user.id}
      `.pipe(Effect.orDie)
    }
    if (options.role) {
      yield* app.sql`UPDATE users SET role = ${options.role} WHERE id = ${user.id}`.pipe(
        Effect.orDie,
      )
    }
    return user
  })
