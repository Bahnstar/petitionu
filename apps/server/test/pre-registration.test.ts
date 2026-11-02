import { assert, describe, it } from "@effect/vitest"
import { appRequestHeaders } from "@petitionu/domain"
import { Effect, Layer } from "effect"
import { UserConfirmed } from "../src/Confirmation.ts"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { recordConfirmations } from "./support/confirmations.ts"
import { makeTestApp, type TestApp } from "./support/harness.ts"
import {
  clickConfirm,
  confirmEmail,
  confirmWithPassword,
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

  it.live("leaves nothing in a browser that registers or is refused", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const email = uniqueEmail()
      const browser = yield* makeBrowser(app)
      const send = (path: string, body: unknown) =>
        browser.request(`/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })

      const registered = yield* send("/sign-up/email", {
        email,
        password: defaultPassword,
        passwordConfirmation: defaultPassword,
        name: "",
      })
      const refused = yield* send("/sign-in/email", { email, password: defaultPassword })

      assert.strictEqual(refused.status, 403)
      assert.isEmpty(registered.headers.getSetCookie())
      assert.isEmpty(refused.headers.getSetCookie())
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

  it.live("can't be kept by registering in the browser the owner confirms in", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const attacker = yield* registerUser(app)
      // A second try at signing in, as an attacker waiting at a shared computer might.
      yield* withEmailTo(
        app,
        attacker.email,
        attacker.browser.auth("/sign-in/email", {
          email: attacker.email,
          password: defaultPassword,
        }),
      )

      const warned = yield* clickConfirm(app, attacker.browser, attacker.email)
      assert.strictEqual(warned.status, 409)
      assert.isUndefined(attacker.browser.cookie("session_token"))

      const confirmed = yield* clickConfirm(app, attacker.browser, attacker.email, {
        removePassword: true,
      })
      assert.isTrue(confirmed.body.passwordRemoved)
      assert.strictEqual((yield* passwordSignIn(app, attacker.email)).status, 401)
    }),
  )
})

describe("confirming your own registration", () => {
  it.live("with the password keeps it, on a device that has never seen the account", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const laptop = yield* makeBrowser(app)

      const response = yield* confirmWithPassword(app, laptop, user.email)
      assert.strictEqual(response.status, 200)
      assert.notProperty(response.body, "passwordRemoved")

      const me = yield* signedIn(laptop)
      assert.strictEqual(me?.id, user.id)
      assert.isTrue(me?.emailVerified)
      assert.isTrue(me?.hasPassword)
      assert.strictEqual((yield* passwordSignIn(app, user.email)).status, 200)
    }),
  )

  it.live("in the browser you registered in still asks for the password", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)

      const asked = yield* clickConfirm(app, user.browser, user.email)
      assert.strictEqual(asked.status, 409)
      assert.strictEqual(asked.body.code, "CONFIRM_REMOVES_PASSWORD")

      yield* confirmEmail(app, user.browser, user.email)
      assert.isTrue((yield* signedIn(user.browser))?.hasPassword)
    }),
  )

  it.live("with the wrong password is a field error and leaves the link usable", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const laptop = yield* makeBrowser(app)

      const wrong = yield* confirmWithPassword(app, laptop, user.email, "not the password")
      assert.strictEqual(wrong.status, 400)
      assert.strictEqual(wrong.body.code, "INVALID_PASSWORD")
      assert.isUndefined(laptop.cookie("session_token"))
      const [row] = yield* app.sql<{ verified: boolean }>`
        SELECT email_verified AS verified FROM users WHERE id = ${user.id}
      `.pipe(Effect.orDie)
      assert.isFalse(row!.verified)
      assert.strictEqual(yield* sessionCount(app, user.id), 0)

      assert.strictEqual((yield* confirmWithPassword(app, laptop, user.email)).status, 200)
    }),
  )

  it.live("stops guessing the password after five tries a minute", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const laptop = yield* makeBrowser(app)

      for (let attempt = 0; attempt < 5; attempt++) {
        const wrong = yield* confirmWithPassword(app, laptop, user.email, `guess ${attempt}`)
        assert.strictEqual(wrong.status, 400)
      }
      assert.strictEqual((yield* confirmWithPassword(app, laptop, user.email)).status, 429)
    }),
  )

  it.live("stops trying links after five a minute", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const statuses = []
      for (let attempt = 0; attempt < 6; attempt++) {
        statuses.push((yield* browser.authGet("/verify-email?token=garbage")).status)
      }
      assert.deepStrictEqual(statuses, [401, 401, 401, 401, 401, 429])
    }),
  )

  it.live("with the password ends a session the account somehow already has", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "unconfirmed" })
      const laptop = yield* makeBrowser(app)

      yield* confirmEmail(app, laptop, user.email)

      assert.isUndefined(yield* signedIn(user.browser))
      assert.strictEqual((yield* signedIn(laptop))?.id, user.id)
      assert.strictEqual(yield* sessionCount(app, user.id), 1)
    }),
  )

  it.live("without the password removes it and says so; a reset restores one", () =>
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

  it.live("doesn't ask or remove anything for an account with no password", () =>
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

describe("sending the password to confirm", () => {
  it.live("refuses anything but the app's own request", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const token = yield* lastEmailedToken(app, user.email)
      const browser = yield* makeBrowser(app)
      const send = (headers: Record<string, string>) =>
        browser.request("/api/auth/verify-email/password", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ token, password: defaultPassword }),
        })

      for (const headers of [
        {},
        { ...appRequestHeaders, "sec-fetch-site": "cross-site" },
        { ...appRequestHeaders, "sec-fetch-site": "same-site" },
      ]) {
        assert.strictEqual((yield* send(headers)).status, 403, JSON.stringify(headers))
      }
      assert.isUndefined(browser.cookie("session_token"))
      assert.strictEqual((yield* send(appRequestHeaders)).status, 200)
    }),
  )

  it.live("answers a link that can't be used as the page's lookup does", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const lookup = yield* browser.linkDetails("confirm", "garbage")
      const response = yield* browser.confirmWithPassword("garbage", defaultPassword)
      assert.deepStrictEqual(response, lookup)
    }),
  )

  it.live("doesn't test passwords against a confirmed account, or sign it in", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const browser = yield* makeBrowser(app)

      const wrong = yield* confirmWithPassword(app, browser, user.email, "not the password")
      const right = yield* confirmWithPassword(app, browser, user.email)

      assert.deepStrictEqual(wrong, right)
      assert.strictEqual(right.status, 200)
      assert.isUndefined(browser.cookie("session_token"))
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

      // The second registrant's password isn't the account's, so it keeps nothing.
      const wrong = yield* browser.confirmWithPassword(token, newPassword)
      assert.strictEqual(wrong.status, 400)
    }),
  )
})
