import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { UserConfirmed } from "../src/Confirmation.ts"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import {
  confirmEmail,
  defaultPassword,
  lastEmailedToken,
  registerUser,
  uniqueEmail,
  withEmailTo,
} from "./support/users.ts"

describe("registration and password sign-in", () => {
  it.live("registers, confirms only after a click, signs out and back in", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const email = uniqueEmail()

      const {
        result: signUp,
        link,
        token,
      } = yield* withEmailTo(
        app,
        email,
        browser.auth("/sign-up/email", {
          email,
          password: defaultPassword,
          passwordConfirmation: defaultPassword,
          name: "",
        }),
      )
      assert.strictEqual(signUp.status, 200, JSON.stringify(signUp.body))
      yield* browser.reloadCsrf
      const registered = yield* browser.rpc((api) => api.getMe())
      assert.isTrue(registered.success, JSON.stringify(registered))
      if (!registered.success) return
      assert.strictEqual(registered.data.email, email)
      assert.isFalse(registered.data.emailVerified)

      assert.strictEqual(link.origin, "https://petitionu.test")
      assert.strictEqual(link.pathname, "/auth/confirm")
      const page = yield* browser.request(`${link.pathname}${link.search}`)
      assert.strictEqual(page.status, 200)
      const afterVisit = yield* browser.rpc((api) => api.getMe())
      assert.deepInclude(afterVisit, { success: true })
      if (afterVisit.success) assert.isFalse(afterVisit.data.emailVerified)

      const confirm = yield* browser.authGet(`/verify-email?token=${encodeURIComponent(token)}`)
      assert.strictEqual(confirm.status, 200)
      const confirmed = yield* browser.rpc((api) => api.getMe())
      if (!confirmed.success) return assert.fail(JSON.stringify(confirmed))
      assert.isTrue(confirmed.data.emailVerified)

      const signOut = yield* browser.auth("/sign-out")
      assert.strictEqual(signOut.status, 200)
      yield* browser.reloadCsrf
      const signedOut = yield* browser.rpc((api) => api.getMe())
      assert.deepStrictEqual(signedOut, {
        success: false,
        errors: [{ type: "not_found", message: "User not found" }],
      })

      const signIn = yield* browser.auth("/sign-in/email", { email, password: defaultPassword })
      assert.strictEqual(signIn.status, 200)
      yield* browser.reloadCsrf
      const signedIn = yield* browser.rpc((api) => api.getMe())
      assert.deepInclude(signedIn, { success: true })
    }),
  )

  it.live("rejects a short password or a confirmation that doesn't match", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const mismatch = yield* browser.auth("/sign-up/email", {
        email: uniqueEmail(),
        password: defaultPassword,
        passwordConfirmation: "something else",
        name: "",
      })
      assert.strictEqual(mismatch.status, 400)
      assert.strictEqual(mismatch.body.message, "Password confirmation does not match")
      const short = yield* browser.auth("/sign-up/email", {
        email: uniqueEmail(),
        password: "short12",
        passwordConfirmation: "short12",
        name: "",
      })
      assert.strictEqual(short.status, 400)
      assert.deepStrictEqual(yield* app.mailer.messages, [])
      yield* Effect.sleep("100 millis")
      assert.deepStrictEqual(yield* app.mailer.messages, [])
    }),
  )
})

describe("becoming confirmed", () => {
  it.live("runs the confirmation callback once, and again later if it failed", () =>
    Effect.gen(function* () {
      const ran: Array<string> = []
      let failNext = true
      const flaky = Layer.succeed(UserConfirmed)((userId) =>
        Effect.suspend(() => {
          ran.push(userId)
          if (!failNext) return Effect.void
          failNext = false
          return Effect.fail(new Error("registry down"))
        }),
      )
      const app = yield* makeTestApp({ userConfirmed: flaky })
      const user = yield* registerUser(app)
      const token = yield* lastEmailedToken(app, user.email)
      yield* user.browser.authGet(`/verify-email?token=${encodeURIComponent(token)}`)
      assert.deepStrictEqual(ran, [user.id])

      // The failed run rolled back; the next request from the user completes it.
      const me = yield* user.browser.rpc((api) => api.getMe())
      if (!me.success) return assert.fail(JSON.stringify(me))
      assert.isTrue(me.data.emailVerified)
      assert.deepStrictEqual(ran, [user.id, user.id])
      yield* user.browser.rpc((api) => api.getMe())
      yield* confirmEmail(app, user.browser, user.email)
      assert.deepStrictEqual(ran, [user.id, user.id])
    }),
  )
})
