import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { makeTestApp, testOrigin } from "./support/harness.ts"
import { createUser } from "./support/users.ts"

/** A raw `getMe` call; `headers` replace the defaults, `messageHeaders` go in the RPC message. */
const rawGetMe = (
  browser: Browser,
  options: {
    readonly token: string
    readonly headers?: Record<string, string | undefined>
    readonly messageHeaders?: ReadonlyArray<readonly [string, string]>
  },
) =>
  Effect.gen(function* () {
    const headers: Record<string, string> = {}
    const merged = {
      "content-type": "application/json",
      "x-csrf-token": options.token,
      origin: testOrigin,
      ...options.headers,
    }
    for (const [name, value] of Object.entries(merged)) {
      if (value !== undefined) headers[name] = value
    }
    // `origin` is only defaulted by the browser when absent from the request.
    const response = yield* browser.request("/rpc", {
      method: "POST",
      headers: merged.origin === undefined ? { ...headers, origin: "" } : headers,
      body: JSON.stringify({
        _tag: "Request",
        id: "1",
        tag: "getMe",
        payload: null,
        headers: options.messageHeaders ?? [],
      }),
    })
    const text = yield* Effect.promise(() => response.text())
    return { status: response.status, text }
  })

const metaToken = (html: string) => /<meta name="csrf-token" content="([^"]+)">/.exec(html)?.[1]

describe("CSRF", () => {
  it.live("the shell carries a token bound to a signed guest cookie", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const response = yield* app.request("/ash-typescript")
      const token = metaToken(yield* Effect.promise(() => response.text()))
      assert.isDefined(token)
      const [cookie = ""] = response.headers.getSetCookie()
      assert.match(cookie, /^__Host-petitionu\.guest=[^;]+;/)
      for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) {
        assert.include(cookie, attribute)
      }

      const browser = yield* makeBrowser(app)
      const page = yield* browser.request("/ash-typescript/petitions/abc")
      const pageToken = metaToken(yield* Effect.promise(() => page.text()))
      assert.strictEqual(pageToken, yield* browser.reloadCsrf)
      const ok = yield* rawGetMe(browser, { token: pageToken! })
      assert.strictEqual(ok.status, 200)
      assert.include(ok.text, "User not found")
      assert.strictEqual((yield* rawGetMe(browser, { token: token! })).status, 403)
    }),
  )

  it.live("rejects RPC calls without the right token, origin or content type", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const token = yield* browser.reloadCsrf
      const other = yield* makeBrowser(app)
      const rejected = [
        { headers: { "x-csrf-token": undefined } },
        { headers: { "x-csrf-token": `${token}x` } },
        { headers: { "x-csrf-token": yield* other.reloadCsrf } },
        { headers: { origin: "https://evil.example" } },
        { headers: { origin: "http://petitionu.test" } },
        { headers: { origin: "null" } },
        { headers: { origin: undefined } },
        { headers: { origin: undefined, "sec-fetch-site": "cross-site" } },
        { headers: { "sec-fetch-site": "same-site" } },
        { headers: { "content-type": "text/plain" } },
        { headers: { "content-type": "application/x-www-form-urlencoded" } },
      ]
      for (const attempt of rejected) {
        const result = yield* rawGetMe(browser, { token, ...attempt })
        assert.strictEqual(result.status, 403, JSON.stringify(attempt))
        assert.notInclude(result.text, "User not found")
      }
      const sameOrigin = yield* rawGetMe(browser, {
        token,
        headers: { origin: undefined, "sec-fetch-site": "same-origin" },
      })
      assert.strictEqual(sameOrigin.status, 200)
    }),
  )

  it.live("a signed-in browser's token is bound to its session", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "confirmed" })
      const sessionToken = yield* user.browser.reloadCsrf
      const signedIn = yield* rawGetMe(user.browser, { token: sessionToken })
      assert.strictEqual(signedIn.status, 200)
      assert.include(signedIn.text, user.email)

      const guest = yield* makeBrowser(app)
      const guestToken = yield* guest.reloadCsrf
      assert.strictEqual((yield* rawGetMe(user.browser, { token: guestToken })).status, 403)
      assert.strictEqual((yield* rawGetMe(guest, { token: sessionToken })).status, 403)
    }),
  )

  it.live("auth headers smuggled in the RPC message are ignored", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const victim = yield* createUser(app, { stage: "confirmed" })
      const victimToken = yield* victim.browser.reloadCsrf
      const attacker = yield* makeBrowser(app)
      const attackerToken = yield* attacker.reloadCsrf
      const smuggled = [
        ["cookie", victim.browser.cookieHeader()],
        ["x-csrf-token", victimToken],
        ["origin", testOrigin],
      ] as const

      const asGuest = yield* rawGetMe(attacker, { token: attackerToken, messageHeaders: smuggled })
      assert.strictEqual(asGuest.status, 200)
      assert.include(asGuest.text, "User not found")
      assert.notInclude(asGuest.text, victim.email)

      const withoutToken = yield* rawGetMe(attacker, {
        token: attackerToken,
        headers: { "x-csrf-token": undefined },
        messageHeaders: smuggled,
      })
      assert.strictEqual(withoutToken.status, 403)

      const other = yield* createUser(app, { stage: "confirmed" })
      const asVictim = yield* rawGetMe(victim.browser, {
        token: victimToken,
        messageHeaders: [["cookie", other.browser.cookieHeader()]],
      })
      assert.include(asVictim.text, victim.email)
      assert.notInclude(asVictim.text, other.email)
    }),
  )
})
