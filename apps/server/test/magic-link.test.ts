import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { recordConfirmations } from "./support/confirmations.ts"
import { makeTestApp } from "./support/harness.ts"
import { createUser, defaultPassword, signIn, uniqueEmail, withEmailTo } from "./support/users.ts"
import type { TestApp } from "./support/harness.ts"

const requestLink = (app: TestApp, email: string) =>
  Effect.gen(function* () {
    const browser = yield* makeBrowser(app)
    const { result, link, token } = yield* withEmailTo(
      app,
      email,
      browser.auth("/sign-in/magic-link", { email }),
    )
    return { browser, response: result, link, token }
  })

const verify = (app: TestApp, token: string) =>
  Effect.gen(function* () {
    const browser = yield* makeBrowser(app)
    const response = yield* browser.authGet(`/magic-link/verify?token=${encodeURIComponent(token)}`)
    yield* browser.reloadCsrf
    return { browser, response, me: yield* browser.rpc((api) => api.getMe()) }
  })

describe("magic link", () => {
  it.live("signs up a new user, confirmed, only after the link's page is clicked", () =>
    Effect.gen(function* () {
      const confirmations = recordConfirmations()
      const app = yield* makeTestApp({ userConfirmed: confirmations.layer })
      const email = uniqueEmail()
      const { browser, response, link, token } = yield* requestLink(app, email)
      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(response.body, { status: true })
      assert.strictEqual(link.origin, "https://petitionu.test")
      assert.strictEqual(link.pathname, "/auth/magic")

      const page = yield* browser.request(`${link.pathname}${link.search}`)
      assert.strictEqual(page.status, 200)
      assert.deepInclude(yield* browser.rpc((api) => api.getMe()), { success: false })

      const { me } = yield* verify(app, token)
      if (!me.success) return assert.fail(JSON.stringify(me))
      assert.strictEqual(me.data.email, email)
      assert.isTrue(me.data.emailVerified)
      assert.deepStrictEqual(confirmations.confirmed, [
        { userId: me.data.id, confirmedAtSet: true },
      ])
    }),
  )

  it.live(
    "confirms an existing unconfirmed user and, against account pre-hijacking, removes their password",
    () =>
      Effect.gen(function* () {
        const confirmations = recordConfirmations()
        const app = yield* makeTestApp({ userConfirmed: confirmations.layer })
        const user = yield* createUser(app, { stage: "unconfirmed" })
        const { token } = yield* requestLink(app, user.email)

        const { me } = yield* verify(app, token)
        if (!me.success) return assert.fail(JSON.stringify(me))
        assert.strictEqual(me.data.id, user.id)
        assert.isTrue(me.data.emailVerified)
        assert.deepStrictEqual(confirmations.confirmed, [{ userId: user.id, confirmedAtSet: true }])

        // Whoever registered the address with a password before its owner proved it loses access.
        assert.deepInclude(yield* user.browser.rpc((api) => api.getMe()), { success: false })
        const passwordSignIn = yield* (yield* makeBrowser(app)).auth("/sign-in/email", {
          email: user.email,
          password: defaultPassword,
        })
        assert.strictEqual(passwordSignIn.status, 401)
      }),
  )

  it.live("signs in a confirmed user and keeps their password", () =>
    Effect.gen(function* () {
      const confirmations = recordConfirmations()
      const app = yield* makeTestApp({ userConfirmed: confirmations.layer })
      const user = yield* createUser(app, { stage: "confirmed" })
      const { token } = yield* requestLink(app, user.email)
      const { me } = yield* verify(app, token)
      if (!me.success) return assert.fail(JSON.stringify(me))
      assert.strictEqual(me.data.id, user.id)
      yield* signIn(app, user.email)
      assert.deepStrictEqual(confirmations.confirmed, [{ userId: user.id, confirmedAtSet: true }])
    }),
  )

  it.live("rejects a used or expired link", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const { token } = yield* requestLink(app, user.email)
      const first = yield* verify(app, token)
      assert.deepInclude(first.me, { success: true })
      const reused = yield* verify(app, token)
      assert.notStrictEqual(reused.response.status, 200)
      assert.deepInclude(reused.me, { success: false })

      const { token: expiring } = yield* requestLink(app, user.email)
      yield* app.sql`UPDATE verification SET expires_at = now() - interval '1 second'`.pipe(
        Effect.orDie,
      )
      const expired = yield* verify(app, expiring)
      assert.notStrictEqual(expired.response.status, 200)
      assert.deepInclude(expired.me, { success: false })
    }),
  )

  it.live("answers the same whether or not the address has an account", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const known = yield* requestLink(app, user.email)
      const unknown = yield* requestLink(app, uniqueEmail())
      assert.strictEqual(known.response.status, unknown.response.status)
      assert.deepStrictEqual(known.response.body, unknown.response.body)
    }),
  )
})
