import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { recordConfirmations } from "./support/confirmations.ts"
import { makeTestApp, type TestApp } from "./support/harness.ts"
import {
  createUser,
  defaultPassword,
  emailsTo,
  signIn,
  uniqueEmail,
  withEmailTo,
} from "./support/users.ts"

const newPassword = "a brand new passphrase"

const requestReset = (app: TestApp, email: string) =>
  Effect.gen(function* () {
    const browser = yield* makeBrowser(app)
    const { result, link, token } = yield* withEmailTo(
      app,
      email,
      browser.auth("/request-password-reset", { email }),
    )
    return { browser, response: result, link, token }
  })

const signedIn = (browser: Browser) =>
  Effect.gen(function* () {
    yield* browser.reloadCsrf
    const me = yield* browser.rpc((api) => api.getMe())
    return me.success
  })

describe("password reset", () => {
  it.live("signs the user in, confirms them and signs out every other session", () =>
    Effect.gen(function* () {
      const confirmations = recordConfirmations()
      const app = yield* makeTestApp({ userConfirmed: confirmations.layer })
      const user = yield* createUser(app, { stage: "unconfirmed" })
      const otherDevice = yield* signIn(app, user.email)

      const { browser, response, link, token } = yield* requestReset(app, user.email)
      assert.strictEqual(response.status, 200)
      assert.strictEqual(link.origin, "https://petitionu.test")
      assert.strictEqual(link.pathname, "/reset")
      assert.strictEqual((yield* browser.request(`${link.pathname}${link.search}`)).status, 200)

      const reset = yield* browser.auth("/reset-password", {
        token,
        newPassword,
        newPasswordConfirmation: newPassword,
      })
      assert.strictEqual(reset.status, 200)
      yield* browser.reloadCsrf
      const me = yield* browser.rpc((api) => api.getMe())
      if (!me.success) return assert.fail(JSON.stringify(me))
      assert.strictEqual(me.data.id, user.id)
      assert.isTrue(me.data.emailVerified)
      assert.deepStrictEqual(confirmations.confirmed, [{ userId: user.id, confirmedAtSet: true }])

      assert.isFalse(yield* signedIn(user.browser))
      assert.isFalse(yield* signedIn(otherDevice))
      const oldPassword = yield* (yield* makeBrowser(app)).auth("/sign-in/email", {
        email: user.email,
        password: defaultPassword,
      })
      assert.strictEqual(oldPassword.status, 401)
      yield* signIn(app, user.email, newPassword)

      const reused = yield* (yield* makeBrowser(app)).auth("/reset-password", {
        token,
        newPassword: "yet another passphrase",
        newPasswordConfirmation: "yet another passphrase",
      })
      assert.strictEqual(reused.status, 400)
    }),
  )

  it.live("rejects a confirmation that doesn't match and keeps the link usable", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const { browser, token } = yield* requestReset(app, user.email)
      for (const newPasswordConfirmation of ["something else", undefined]) {
        const mismatch = yield* browser.auth("/reset-password", {
          token,
          newPassword,
          newPasswordConfirmation,
        })
        assert.strictEqual(mismatch.status, 400)
        assert.strictEqual(mismatch.body.message, "Password confirmation does not match")
      }
      assert.isFalse(yield* signedIn(browser))
      yield* signIn(app, user.email, defaultPassword)

      const reset = yield* browser.auth("/reset-password", {
        token,
        newPassword,
        newPasswordConfirmation: newPassword,
      })
      assert.strictEqual(reset.status, 200)
      yield* signIn(app, user.email, newPassword)
    }),
  )

  it.live("rejects an expired link", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const { browser, token } = yield* requestReset(app, user.email)
      yield* app.sql`UPDATE verification SET expires_at = now() - interval '1 second'`.pipe(
        Effect.orDie,
      )
      const reset = yield* browser.auth("/reset-password", {
        token,
        newPassword,
        newPasswordConfirmation: newPassword,
      })
      assert.strictEqual(reset.status, 400)
      assert.isFalse(yield* signedIn(browser))
      yield* signIn(app, user.email, defaultPassword)
    }),
  )

  it.live("answers the same whether or not the address has an account", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const known = yield* requestReset(app, user.email)
      const stranger = uniqueEmail()
      const unknown = yield* (yield* makeBrowser(app)).auth("/request-password-reset", {
        email: stranger,
      })
      assert.strictEqual(known.response.status, unknown.status)
      assert.deepStrictEqual(known.response.body, unknown.body)
      assert.strictEqual(yield* emailsTo(app, stranger), 0)
    }),
  )
})

describe("change password", () => {
  it.live("needs the current password and signs out every other session", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const otherDevice = yield* signIn(app, user.email)

      const wrong = yield* user.browser.auth("/change-password", {
        currentPassword: "not my password",
        newPassword,
      })
      assert.strictEqual(wrong.status, 400)
      assert.isTrue(yield* signedIn(otherDevice))

      // The server revokes other sessions even when the client doesn't ask it to.
      const changed = yield* user.browser.auth("/change-password", {
        currentPassword: defaultPassword,
        newPassword,
        revokeOtherSessions: false,
      })
      assert.strictEqual(changed.status, 200)
      assert.isTrue(yield* signedIn(user.browser))
      assert.isFalse(yield* signedIn(otherDevice))
      yield* signIn(app, user.email, newPassword)
    }),
  )
  it.live("rejects a new-password confirmation that doesn't match, when one is sent", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const mismatch = yield* user.browser.auth("/change-password", {
        currentPassword: defaultPassword,
        newPassword,
        newPasswordConfirmation: "something else",
      })
      assert.strictEqual(mismatch.status, 400)
      assert.strictEqual(mismatch.body.message, "Password confirmation does not match")
      yield* signIn(app, user.email, defaultPassword)

      const changed = yield* user.browser.auth("/change-password", {
        currentPassword: defaultPassword,
        newPassword,
        newPasswordConfirmation: newPassword,
      })
      assert.strictEqual(changed.status, 200)
      yield* signIn(app, user.email, newPassword)
    }),
  )

  it.live("getMe says whether there's a password; a reset gives a magic-link account one", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const withPassword = yield* createUser(app, { stage: "confirmed" })
      const me = yield* withPassword.browser.rpc((api) => api.getMe())
      assert.isTrue(me.success && me.data.hasPassword)

      // Signing up through a magic link creates no password.
      const email = uniqueEmail()
      const browser = yield* makeBrowser(app)
      const { token } = yield* withEmailTo(
        app,
        email,
        browser.auth("/sign-in/magic-link", { email }),
      )
      yield* browser.authGet(`/magic-link/verify?token=${encodeURIComponent(token)}`)
      yield* browser.reloadCsrf
      const magic = yield* browser.rpc((api) => api.getMe())
      if (!magic.success) return assert.fail(JSON.stringify(magic))
      assert.isFalse(magic.data.hasPassword)
      const change = yield* browser.auth("/change-password", {
        currentPassword: "anything at all",
        newPassword,
      })
      assert.strictEqual(change.status, 400)

      // A reset link sets one.
      const reset = yield* requestReset(app, email)
      assert.strictEqual(
        (yield* reset.browser.auth("/reset-password", {
          token: reset.token,
          newPassword,
          newPasswordConfirmation: newPassword,
        })).status,
        200,
      )
      const after = yield* signIn(app, email, newPassword)
      const reread = yield* after.rpc((api) => api.getMe())
      assert.isTrue(reread.success && reread.data.hasPassword)
    }),
  )
})

describe("rate limits", () => {
  it.live("limit repeated sign-in attempts and reset requests per client", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const attacker = yield* makeBrowser(app)
      const statuses: Array<number> = []
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = yield* attacker.auth("/sign-in/email", {
          email: user.email,
          password: `guess-${attempt}-wrong`,
        })
        statuses.push(response.status)
      }
      assert.deepStrictEqual(statuses, [401, 401, 401, 401, 401, 429])
      const correct = yield* attacker.auth("/sign-in/email", {
        email: user.email,
        password: defaultPassword,
      })
      assert.strictEqual(correct.status, 429)
      yield* signIn(app, user.email)

      const resets: Array<number> = []
      for (let attempt = 0; attempt < 4; attempt++) {
        resets.push((yield* attacker.auth("/request-password-reset", { email: user.email })).status)
      }
      assert.deepStrictEqual(resets, [200, 200, 200, 429])

      const magic: Array<number> = []
      for (let attempt = 0; attempt < 4; attempt++) {
        magic.push((yield* attacker.auth("/sign-in/magic-link", { email: user.email })).status)
      }
      assert.deepStrictEqual(magic, [200, 200, 200, 429])
    }),
  )

  it.live("key clients by the configured client-IP header, e.g. Cloudflare's", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp({ env: { CLIENT_IP_HEADER: "cf-connecting-ip" } })
      const user = yield* createUser(app, { stage: "confirmed" })
      // One proxy hop (the same X-Forwarded-For) in front of two different clients.
      const proxy = yield* makeBrowser(app)
      const signInFrom = (client: string) =>
        Effect.map(
          proxy.request("/api/auth/sign-in/email", {
            method: "POST",
            headers: { "content-type": "application/json", "cf-connecting-ip": client },
            body: JSON.stringify({ email: user.email, password: "a-wrong-guess" }),
          }),
          (response) => response.status,
        )
      const statuses: Array<number> = []
      for (let attempt = 0; attempt < 6; attempt++) statuses.push(yield* signInFrom("203.0.113.7"))
      assert.deepStrictEqual(statuses, [401, 401, 401, 401, 401, 429])
      assert.strictEqual(yield* signInFrom("203.0.113.8"), 401)
    }),
  )
})
