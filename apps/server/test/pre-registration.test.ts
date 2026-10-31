import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { UserConfirmed } from "../src/Confirmation.ts"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { recordConfirmations } from "./support/confirmations.ts"
import { makeTestApp, type TestApp } from "./support/harness.ts"
import {
  confirmEmail,
  createUser,
  defaultPassword,
  registerUser,
  signIn,
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
    return (yield* browser.auth("/sign-in/email", { email, password })).status
  })

/** Whoever registered the address before its owner proved it has no way back in. */
const assertLockedOut = (app: TestApp, attacker: { browser: Browser; email: string }) =>
  Effect.gen(function* () {
    assert.isUndefined(yield* signedIn(attacker.browser))
    assert.strictEqual(yield* passwordSignIn(app, attacker.email), 401)
  })

/** The address's owner proves it, from a browser that has never seen the account. */
const owner = {
  clicksConfirm: (app: TestApp, email: string) =>
    Effect.gen(function* () {
      const browser = yield* makeBrowser(app)
      yield* confirmEmail(app, browser, email)
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

describe("an address registered by someone else", () => {
  for (const [name, prove] of Object.entries(owner)) {
    it.live(`loses the registrant's access when the owner ${name}`, () =>
      Effect.gen(function* () {
        const confirmations = recordConfirmations()
        const app = yield* makeTestApp({ userConfirmed: confirmations.layer })
        const attacker = yield* registerUser(app)
        const otherDevice = yield* signIn(app, attacker.email)

        const browser = yield* prove(app, attacker.email)

        const me = yield* signedIn(browser)
        assert.strictEqual(me?.id, attacker.id)
        assert.isTrue(me?.emailVerified)
        assert.deepStrictEqual(confirmations.confirmed, [
          { userId: attacker.id, confirmedAtSet: true },
        ])
        yield* assertLockedOut(app, attacker)
        assert.isUndefined(yield* signedIn(otherDevice))
      }),
    )
  }

  it.live("loses the registrant's access even when `UserConfirmed` fails and is retried", () =>
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

  it.live("doesn't survive a Confirm click from a browser signed in as someone else", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const attacker = yield* registerUser(app)
      const friend = yield* createUser(app, { stage: "confirmed" })

      yield* confirmEmail(app, friend.browser, attacker.email)

      yield* assertLockedOut(app, attacker)
      assert.strictEqual((yield* signedIn(friend.browser))?.id, attacker.id)
    }),
  )
})

describe("confirming your own registration", () => {
  it.live("in the browser you registered in keeps your password and session", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const otherDevice = yield* signIn(app, user.email)

      yield* confirmEmail(app, user.browser, user.email)

      const me = yield* signedIn(user.browser)
      assert.strictEqual(me?.id, user.id)
      assert.isTrue(me?.emailVerified)
      assert.isTrue(me?.hasPassword)
      assert.strictEqual(yield* passwordSignIn(app, user.email), 200)
      // A password can leak, so even here only the browser that proved the address stays in.
      assert.isUndefined(yield* signedIn(otherDevice))
    }),
  )

  it.live("signed in on a second device keeps your password too", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const phone = yield* signIn(app, user.email)

      yield* confirmEmail(app, phone, user.email)

      assert.isTrue((yield* signedIn(phone))?.emailVerified)
      assert.isUndefined(yield* signedIn(user.browser))
      assert.strictEqual(yield* passwordSignIn(app, user.email), 200)
    }),
  )

  it.live("in a signed-out browser costs you the password; a reset sets a new one", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)

      const phone = yield* owner.clicksConfirm(app, user.email)

      assert.isFalse((yield* signedIn(phone))?.hasPassword)
      yield* owner.resetsPassword(app, user.email)
      assert.strictEqual(yield* passwordSignIn(app, user.email, newPassword), 200)
    }),
  )

  it.live("twice in a signed-out browser doesn't end the session the first click started", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const phone = yield* owner.clicksConfirm(app, user.email)

      const again = yield* makeBrowser(app)
      yield* confirmEmail(app, again, user.email)

      assert.strictEqual((yield* signedIn(phone))?.id, user.id)
    }),
  )
})

describe("an address already confirmed", () => {
  it.live("keeps its password and sessions when an old Confirm link is clicked", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })

      yield* confirmEmail(app, yield* makeBrowser(app), user.email)

      assert.strictEqual((yield* signedIn(user.browser))?.id, user.id)
      assert.strictEqual(yield* passwordSignIn(app, user.email), 200)
    }),
  )

  it.live("isn't taken by registering it again", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const email = uniqueEmail()
      yield* createUser(app, { stage: "confirmed", email })
      const browser = yield* makeBrowser(app)
      const again = yield* browser.auth("/sign-up/email", {
        email,
        password: newPassword,
        passwordConfirmation: newPassword,
        name: "",
      })
      assert.notStrictEqual(again.status, 200)
      assert.strictEqual(yield* passwordSignIn(app, email, newPassword), 401)
    }),
  )
})
