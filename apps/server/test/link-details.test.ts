import { assert, describe, it } from "@effect/vitest"
import { appRequestHeaders } from "@petitionu/domain"
import { signJWT } from "better-auth/crypto"
import { Effect } from "effect"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { authSecret, makeTestApp, type TestApp, testOrigin } from "./support/harness.ts"
import {
  createUser,
  lastEmailedToken,
  registerUser,
  uniqueEmail,
  withEmailTo,
} from "./support/users.ts"

const magicToken = (app: TestApp, email: string) =>
  Effect.gen(function* () {
    const browser = yield* makeBrowser(app)
    const { token } = yield* withEmailTo(
      app,
      email,
      browser.auth("/sign-in/magic-link", { email }),
    )
    return token
  })

const verified = (app: TestApp, userId: string) =>
  Effect.map(
    app.sql<{ verified: boolean }>`
      SELECT email_verified AS verified FROM users WHERE id = ${userId}
    `.pipe(Effect.orDie),
    ([row]) => row!.verified,
  )

const signedInEmail = (browser: Browser) =>
  Effect.gen(function* () {
    yield* browser.reloadCsrf
    const me = yield* browser.rpc((api) => api.getMe())
    return me.success ? me.data.email : undefined
  })

describe("looking up an emailed link", () => {
  it.live("names a Confirm link's address and leaves the link unused", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const token = yield* lastEmailedToken(app, user.email)
      const browser = yield* makeBrowser(app)

      for (let look = 0; look < 3; look++) {
        const details = yield* browser.linkDetails("confirm", token)
        assert.strictEqual(details.status, 200)
        assert.strictEqual(details.body.email, user.email)
        assert.isNull(details.body.signedInAs)
      }

      assert.isUndefined(browser.cookie("session_token"))
      assert.isFalse(yield* verified(app, user.id))
    }),
  )

  it.live("names a magic link's address, even a new one, and leaves the link unused", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const email = uniqueEmail()
      const token = yield* magicToken(app, email)
      const browser = yield* makeBrowser(app)

      for (let look = 0; look < 3; look++) {
        const details = yield* browser.linkDetails("magic", token)
        assert.strictEqual(details.status, 200)
        assert.strictEqual(details.body.email, email)
      }
      assert.isUndefined(browser.cookie("session_token"))

      const click = yield* browser.authGet(`/magic-link/verify?token=${encodeURIComponent(token)}`)
      assert.strictEqual(click.status, 200)
      assert.strictEqual(yield* signedInEmail(browser), email)
    }),
  )

  it.live("says whether confirming would need the account's password", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const lookup = (email: string) =>
        Effect.andThen(lastEmailedToken(app, email), (token) =>
          browser.linkDetails("confirm", token),
        )

      const registered = yield* registerUser(app)
      assert.isTrue((yield* lookup(registered.email)).body.needsPassword)

      const passwordless = yield* registerUser(app)
      yield* app.sql`DELETE FROM account WHERE user_id = ${passwordless.id}`.pipe(Effect.orDie)
      assert.isFalse((yield* lookup(passwordless.email)).body.needsPassword)

      const confirmed = yield* createUser(app, { stage: "confirmed" })
      assert.isFalse((yield* lookup(confirmed.email)).body.needsPassword)

      const magic = yield* browser.linkDetails("magic", yield* magicToken(app, registered.email))
      assert.isFalse(magic.body.needsPassword)
    }),
  )

  it.live("leaves a Confirm link working after the lookup", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const token = yield* lastEmailedToken(app, user.email)
      const browser = yield* makeBrowser(app)

      yield* browser.linkDetails("confirm", token)
      assert.strictEqual((yield* browser.confirmWithPassword(token, user.password)).status, 200)
    }),
  )

  it.live("says when the link would replace the account this browser is signed in to", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const current = yield* createUser(app, { stage: "confirmed" })
      const target = uniqueEmail()

      const details = yield* current.browser.linkDetails("magic", yield* magicToken(app, target))
      assert.strictEqual(details.body.email, target)
      assert.strictEqual(details.body.signedInAs, current.email)

      const attacker = yield* registerUser(app)
      const confirm = yield* current.browser.linkDetails(
        "confirm",
        yield* lastEmailedToken(app, attacker.email),
      )
      assert.strictEqual(confirm.body.signedInAs, current.email)

      assert.strictEqual(yield* signedInEmail(current.browser), current.email)
    }),
  )

  it.live("doesn't warn about the account the link is for", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const details = yield* user.browser.linkDetails(
        "magic",
        yield* magicToken(app, user.email.toUpperCase()),
      )
      assert.isNull(details.body.signedInAs)
    }),
  )

  it.live("doesn't warn when an old Confirm link wouldn't sign anyone in", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const confirmed = yield* createUser(app, { stage: "confirmed" })
      const other = yield* createUser(app, { stage: "confirmed" })
      const details = yield* other.browser.linkDetails(
        "confirm",
        yield* lastEmailedToken(app, confirmed.email),
      )
      assert.strictEqual(details.body.email, confirmed.email)
      assert.isNull(details.body.signedInAs)
    }),
  )

  it.live("answers every link that can't be used the same way", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)

      const expiredConfirm = yield* Effect.promise(() =>
        signJWT({ email: uniqueEmail() }, authSecret, -60),
      )
      const unknownUser = yield* Effect.promise(() =>
        signJWT({ email: uniqueEmail() }, authSecret, 60),
      )
      const forged = yield* Effect.promise(() =>
        signJWT({ email: uniqueEmail() }, "someone else's secret, long enough to sign", 60),
      )

      const used = uniqueEmail()
      const usedToken = yield* magicToken(app, used)
      yield* browser.authGet(`/magic-link/verify?token=${encodeURIComponent(usedToken)}`)
      const expiredMagic = yield* magicToken(app, uniqueEmail())
      yield* app.sql`
        UPDATE verification SET expires_at = now() - interval '1 second'
        WHERE value LIKE ${"%magic-link%"}
      `.pipe(Effect.orDie)

      const answers = []
      for (const [purpose, token] of [
        // First: any magic lookup also sweeps expired rows, which would hide this one.
        ["magic", expiredMagic],
        ["confirm", "garbage"],
        ["confirm", expiredConfirm],
        ["confirm", unknownUser],
        ["confirm", forged],
        ["magic", "garbage"],
        ["magic", usedToken],
      ] as const) {
        const reader = yield* makeBrowser(app)
        answers.push(yield* reader.linkDetails(purpose, token))
      }

      for (const answer of answers) assert.deepStrictEqual(answer, answers[0])
      assert.strictEqual(answers[0]!.status, 400)
      assert.notProperty(answers[0]!.body, "email")
    }),
  )

  it.live("refuses anything but the app's own request", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* registerUser(app)
      const token = yield* lastEmailedToken(app, user.email)
      const browser = yield* makeBrowser(app)
      const lookup = (headers: Record<string, string>) =>
        browser.request("/api/auth/link-details", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ purpose: "confirm", token }),
        })

      for (const headers of [
        {},
        { ...appRequestHeaders, "sec-fetch-site": "cross-site" },
        { ...appRequestHeaders, "sec-fetch-site": "same-site" },
      ]) {
        const response = yield* lookup(headers)
        assert.strictEqual(response.status, 403, JSON.stringify(headers))
        assert.notInclude(yield* Effect.promise(() => response.text()), user.email)
      }
      assert.strictEqual((yield* lookup(appRequestHeaders)).status, 200)
    }),
  )

  it.live("grants no CORS preflight", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const preflight = yield* app.request(`${testOrigin}/api/auth/link-details`, {
        method: "OPTIONS",
        headers: {
          origin: "https://evil.test",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,x-petitionu-app",
        },
      })
      assert.isFalse(preflight.ok, String(preflight.status))
      assert.isFalse(preflight.headers.has("access-control-allow-origin"))
    }),
  )

  it.live("is rate limited", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const statuses = []
      for (let attempt = 0; attempt < 21; attempt++) {
        statuses.push((yield* browser.linkDetails("confirm", "garbage")).status)
      }
      assert.deepStrictEqual(statuses, [...Array.from({ length: 20 }, () => 400), 429])
    }),
  )
})
