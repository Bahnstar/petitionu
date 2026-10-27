import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { defaultPassword, lastEmailedToken, uniqueEmail } from "./support/users.ts"

describe("registration and password sign-in", () => {
  it.live("registers, confirms only after a click, signs out and back in", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const email = uniqueEmail()

      const signUp = yield* browser.auth("/sign-up/email", {
        email,
        password: defaultPassword,
        passwordConfirmation: defaultPassword,
        name: "",
      })
      assert.strictEqual(signUp.status, 200, JSON.stringify(signUp.body))
      yield* browser.reloadCsrf
      const registered = yield* browser.rpc((api) => api.getMe())
      assert.isTrue(registered.success, JSON.stringify(registered))
      if (!registered.success) return
      assert.strictEqual(registered.data.email, email)
      assert.isFalse(registered.data.emailVerified)

      const link = yield* app.mailer.lastLinkTo(email)
      assert.strictEqual(link.origin, "https://petitionu.test")
      assert.strictEqual(link.pathname, "/auth/confirm")
      const page = yield* browser.request(`${link.pathname}${link.search}`)
      assert.strictEqual(page.status, 200)
      const afterVisit = yield* browser.rpc((api) => api.getMe())
      assert.deepInclude(afterVisit, { success: true })
      if (afterVisit.success) assert.isFalse(afterVisit.data.emailVerified)

      const token = yield* lastEmailedToken(app, email)
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
    }),
  )
})
