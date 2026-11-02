import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { UserConfirmed } from "../src/Confirmation.ts"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { recordConfirmations } from "./support/confirmations.ts"
import { makeTestApp, type TestApp, testOrigin } from "./support/harness.ts"
import {
  clickConfirm,
  confirmEmail,
  createUser,
  defaultPassword,
  emailsTo,
  lastEmailedToken,
  registerUser,
  uniqueEmail,
  withEmailTo,
} from "./support/users.ts"

const newPassword = "a brand new passphrase"

const signedIn = (browser: Browser) =>
  Effect.gen(function* () {
    yield* browser.reloadCsrf
    const me = yield* browser.rpc((api) => api.getMe())
    return me.success ? me.data : undefined
  })

const passwordSignIn = (app: TestApp, email: string, password = defaultPassword) =>
  Effect.gen(function* () {
    const browser = yield* makeBrowser(app)
    return yield* browser.auth("/sign-in/email", { email, password })
  })

const sessionCount = (app: TestApp, userId: string) =>
  Effect.map(
    app.sql<{ count: number }>`
      SELECT count(*)::int AS count FROM session WHERE user_id = ${userId}
    `.pipe(Effect.orDie),
    ([row]) => row!.count,
  )

/** The address's owner proves it, from a browser that has never seen the account. */
const owner = {
  clicksConfirm: (app: TestApp, email: string) =>
    Effect.gen(function* () {
      const browser = yield* makeBrowser(app)
      yield* confirmEmail(app, browser, email, { removePassword: true })
      return browser
    }),
  usesMagicLink: (app: TestApp, email: string) =>
    Effect.gen(function* () {
      const browser = yield* makeBrowser(app)
      const { token } = yield* withEmailTo(
        app,
        email,
        browser.auth("/sign-in/magic-link", { email }),
      )
      yield* browser.authGet(`/magic-link/verify?token=${encodeURIComponent(token)}`)
      return browser
    }),
  resetsPassword: (app: TestApp, email: string) =>
    Effect.gen(function* () {
      const browser = yield* makeBrowser(app)
      const { token } = yield* withEmailTo(
        app,
        email,
        browser.auth("/request-password-reset", { email }),
      )
      yield* browser.auth("/reset-password", {
        token,
        newPassword,
        newPasswordConfirmation: newPassword,
      })
      return browser
    }),
}

/** Whoever registered the address before its owner proved it has no way in. */
const assertLockedOut = (app: TestApp, attacker: { browser: Browser; email: string }) =>
  Effect.gen(function* () {
    assert.isUndefined(yield* signedIn(attacker.browser))
    assert.strictEqual((yield* passwordSignIn(app, attacker.email)).status, 401)
  })

describe("an unconfirmed account", () => {
  it.live("can't sign in with its password; the right password sends a new link", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const browser = yield* makeBrowser(app)
      const before = yield* emailsTo(app, user.email)

      const wrong = yield* browser.auth("/sign-in/email", {
        email: user.email,
        password: "not the password",
      })
      assert.strictEqual(wrong.status, 401)
      assert.strictEqual(yield* emailsTo(app, user.email), before)

      const { result, link } = yield* withEmailTo(
        app,
        user.email,
        browser.auth("/sign-in/email", { email: user.email, password: defaultPassword }),
      )
      assert.strictEqual(result.status, 403)
      assert.strictEqual(result.body.code, "EMAIL_NOT_VERIFIED")
      assert.strictEqual(link.pathname, "/auth/confirm")
      assert.isUndefined(browser.cookie("session_token"))
      assert.strictEqual(yield* sessionCount(app, user.id), 0)
    }),
  )
})

describe("an address registered by someone else", () => {
  for (const [name, prove] of Object.entries(owner)) {
    it.live(`locks the registrant out when the owner ${name}`, () =>
      Effect.gen(function* () {
        const confirmations = recordConfirmations()
        const app = yield* makeTestApp({ userConfirmed: confirmations.layer })
        const attacker = yield* registerUser(app)

        const browser = yield* prove(app, attacker.email)

        const me = yield* signedIn(browser)
        assert.strictEqual(me?.id, attacker.id)
        assert.isTrue(me?.emailVerified)
        assert.deepStrictEqual(confirmations.confirmed, [
          { userId: attacker.id, confirmedAtSet: true },
        ])
        yield* assertLockedOut(app, attacker)
      }),
    )
  }

  it.live("locks the registrant out even when `UserConfirmed` fails and is retried", () =>
    Effect.gen(function* () {
      let registryDown = true
      const flaky = Layer.succeed(UserConfirmed)(() =>
        registryDown ? Effect.fail(new Error("registry down")) : Effect.void,
      )
      const app = yield* makeTestApp({ userConfirmed: flaky })
      const attacker = yield* registerUser(app)

      const browser = yield* owner.clicksConfirm(app, attacker.email)
      yield* assertLockedOut(app, attacker)
      assert.isFalse((yield* signedIn(browser))?.emailVerified)

      // The retry runs on the owner's next request, and hands nothing back to the registrant.
      registryDown = false
      assert.isTrue((yield* signedIn(browser))?.emailVerified)
      yield* assertLockedOut(app, attacker)
    }),
  )

  it.live("ends a session the account somehow already has", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const attacker = yield* createUser(app, { stage: "unconfirmed" })
      yield* owner.clicksConfirm(app, attacker.email)
      yield* assertLockedOut(app, attacker)
    }),
  )

  it.live("loses the password from a browser signed in as someone else, after a warning", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const attacker = yield* registerUser(app)
      const friend = yield* createUser(app, { stage: "confirmed" })

      const warned = yield* clickConfirm(app, friend.browser, attacker.email)
      assert.strictEqual(warned.status, 409)
      assert.strictEqual((yield* signedIn(friend.browser))?.id, friend.id)

      const confirmed = yield* clickConfirm(app, friend.browser, attacker.email, {
        removePassword: true,
      })
      assert.isTrue(confirmed.body.passwordRemoved)
      yield* assertLockedOut(app, attacker)
      assert.strictEqual((yield* signedIn(friend.browser))?.id, attacker.id)
    }),
  )

  for (const [name, tamper] of [
    ["made up", (value: string) => `${value.slice(0, 36)}.${"A".repeat(43)}=`],
    ["for another account", (_value: string, other: string) => other],
  ] as const) {
    it.live(`isn't kept by a password-holder cookie that is ${name}`, () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        const attacker = yield* registerUser(app)
        const other = yield* registerUser(app)
        const token = yield* lastEmailedToken(app, attacker.email)
        const cookieName = "__Host-petitionu.password-holder"
        const value = tamper(
          attacker.browser.cookie(cookieName)!,
          other.browser.cookie(cookieName)!,
        )

        const response = yield* app.request(
          `${testOrigin}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
          {
            headers: {
              cookie: `${cookieName}=${value}`,
              "sec-fetch-site": "same-origin",
              "sec-fetch-dest": "empty",
            },
          },
        )

        assert.strictEqual(response.status, 409)
      }),
    )
  }
})

describe("confirming your own registration", () => {
  it.live("in the browser you registered in keeps your password, with no warning", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)

      const response = yield* clickConfirm(app, user.browser, user.email)
      assert.strictEqual(response.status, 200)
      assert.notProperty(response.body, "passwordRemoved")

      const me = yield* signedIn(user.browser)
      assert.strictEqual(me?.id, user.id)
      assert.isTrue(me?.emailVerified)
      assert.isTrue(me?.hasPassword)
      assert.strictEqual((yield* passwordSignIn(app, user.email)).status, 200)
    }),
  )

  it.live("after signing in on a second device keeps your password there too", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const phone = yield* makeBrowser(app)
      yield* withEmailTo(
        app,
        user.email,
        phone.auth("/sign-in/email", { email: user.email, password: defaultPassword }),
      )

      yield* confirmEmail(app, phone, user.email)

      assert.isTrue((yield* signedIn(phone))?.hasPassword)
      assert.strictEqual((yield* passwordSignIn(app, user.email)).status, 200)
    }),
  )

  it.live("in another browser warns first and changes nothing until you accept", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const phone = yield* makeBrowser(app)

      const warned = yield* clickConfirm(app, phone, user.email)
      assert.strictEqual(warned.status, 409)
      assert.strictEqual(warned.body.code, "CONFIRM_REMOVES_PASSWORD")
      assert.isUndefined(phone.cookie("session_token"))
      const [row] = yield* app.sql<{ verified: boolean }>`
        SELECT email_verified AS verified FROM users WHERE id = ${user.id}
      `.pipe(Effect.orDie)
      assert.isFalse(row!.verified)

      // The warning is not the end of the road: the registering browser still keeps the password.
      yield* confirmEmail(app, user.browser, user.email)
      assert.isTrue((yield* signedIn(user.browser))?.hasPassword)
    }),
  )

  it.live("in another browser, accepted, removes the password and says so; a reset restores", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const phone = yield* makeBrowser(app)

      const response = yield* clickConfirm(app, phone, user.email, { removePassword: true })
      assert.strictEqual(response.status, 200)
      assert.isTrue(response.body.passwordRemoved)

      assert.isFalse((yield* signedIn(phone))?.hasPassword)
      yield* owner.resetsPassword(app, user.email)
      assert.strictEqual((yield* passwordSignIn(app, user.email, newPassword)).status, 200)
    }),
  )

  it.live("doesn't warn or remove anything for an account with no password", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      yield* app.sql`DELETE FROM account WHERE user_id = ${user.id}`.pipe(Effect.orDie)

      const response = yield* clickConfirm(app, yield* makeBrowser(app), user.email)
      assert.strictEqual(response.status, 200)
      assert.notProperty(response.body, "passwordRemoved")
    }),
  )
})

describe("an address already confirmed", () => {
  it.live("gets no warning, and keeps everything, when an old Confirm link is clicked", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })

      const response = yield* clickConfirm(app, yield* makeBrowser(app), user.email)

      assert.strictEqual(response.status, 200)
      assert.notProperty(response.body, "passwordRemoved")
      assert.strictEqual((yield* signedIn(user.browser))?.id, user.id)
      assert.strictEqual((yield* passwordSignIn(app, user.email)).status, 200)
    }),
  )
})

describe("registering an address that has an account", () => {
  const signUp = (browser: Browser, email: string, password = newPassword) =>
    browser.auth("/sign-up/email", {
      email,
      password,
      passwordConfirmation: password,
      name: "",
    })

  const neutral = (body: { user: Record<string, unknown> }) => {
    const { id: _id, createdAt: _created, updatedAt: _updated, email: _email, ...rest } = body.user
    return { ...body, user: rest }
  }

  it.live("answers as it would for a new address, and emails the owner a way in", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const taken = yield* createUser(app, { stage: "confirmed" })
      const first = yield* makeBrowser(app)
      const second = yield* makeBrowser(app)

      const {
        result: existing,
        email,
        link,
      } = yield* withEmailTo(app, taken.email, signUp(first, taken.email))
      const fresh = uniqueEmail()
      const { result: created } = yield* withEmailTo(app, fresh, signUp(second, fresh))

      assert.strictEqual(existing.status, created.status)
      assert.deepStrictEqual(neutral(existing.body), neutral(created.body))
      const cookieName = "__Host-petitionu.password-holder"
      assert.isDefined(first.cookie(cookieName))
      assert.isDefined(second.cookie(cookieName))

      assert.strictEqual(email.subject, "You already have an account")
      assert.strictEqual(link.pathname, "/sign-in")
      assert.strictEqual((yield* passwordSignIn(app, taken.email, newPassword)).status, 401)
      assert.strictEqual((yield* passwordSignIn(app, taken.email)).status, 200)
    }),
  )

  it.live("doesn't replace an unconfirmed registrant's password or let the second one in", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const token = yield* lastEmailedToken(app, user.email)
      const browser = yield* makeBrowser(app)

      const { result } = yield* withEmailTo(app, user.email, signUp(browser, user.email))
      assert.strictEqual(result.status, 200)
      assert.strictEqual((yield* passwordSignIn(app, user.email, newPassword)).status, 401)

      // The second registrant's cookie names a made-up account, so it keeps nothing.
      const click = yield* browser.authGet(`/verify-email?token=${encodeURIComponent(token)}`)
      assert.strictEqual(click.status, 409)
    }),
  )
})
