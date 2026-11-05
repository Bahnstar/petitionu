import { assert, describe, it } from "@effect/vitest"
import { appRequestHeader, appRequestHeaders } from "@petitionu/domain"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp, type TestApp, testOrigin } from "./support/harness.ts"
import { registerUser, uniqueEmail, withEmailTo } from "./support/users.ts"

const evilOrigin = "https://evil.test"

/** How a browser sends a request it wasn't asked to make by the app's own `fetch`. */
const crossSiteRequests = {
  "a link on another site": {
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  },
  "a redirect from a sibling subdomain": {
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  },
  "a link inside the app, such as one in a petition": {
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  },
  "an image on another site": {
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-dest": "image",
  },
  "a script's `fetch` on another site": {
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  },
  "a script's `fetch` on a sibling subdomain": {
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  },
  "a client that sends no fetch metadata": {},
  "a same-origin `fetch` without the app's header": {
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  },
  "a preflighted `fetch` from another site": {
    ...appRequestHeaders,
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  },
  "a preflighted `fetch` from a sibling subdomain": {
    ...appRequestHeaders,
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  },
  "the app's header on a request the browser says the user started": {
    ...appRequestHeaders,
    "sec-fetch-site": "none",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  },
}

/** A link the attacker can get from their own account, one that signs the opener in. */
const crafted = {
  "verify-email": (app: TestApp) =>
    Effect.gen(function* () {
      const attacker = yield* registerUser(app)
      const url = yield* app.mailer.lastLinkTo(attacker.email)
      return `/api/auth/verify-email?token=${url.searchParams.get("token")}&removePassword=true`
    }),
  "magic-link/verify": (app: TestApp) =>
    Effect.gen(function* () {
      const email = uniqueEmail()
      const browser = yield* makeBrowser(app)
      const { token } = yield* withEmailTo(
        app,
        email,
        browser.auth("/sign-in/magic-link", { email }),
      )
      return `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`
    }),
}

describe("emailed link endpoints", () => {
  for (const [route, craft] of Object.entries(crafted)) {
    for (const [name, headers] of Object.entries(crossSiteRequests)) {
      it.live(`/${route} doesn't sign a browser in from ${name}`, () =>
        Effect.gen(function* () {
          const app = yield* makeTestApp()
          const link = yield* craft(app)

          const victim = yield* makeBrowser(app)
          const response = yield* victim.request(link, { headers: { origin: "", ...headers } })

          assert.strictEqual(response.status, 403)
          assert.isUndefined(victim.cookie("session_token"))
          yield* victim.reloadCsrf
          assert.deepInclude(yield* victim.rpc((api) => api.getMe()), { success: false })
        }),
      )
    }

    it.live(`/${route} still works when the page calls it, and the link survives a block`, () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        const link = yield* craft(app)
        const browser = yield* makeBrowser(app)
        const scanner = yield* makeBrowser(app)
        yield* scanner.request(link, { headers: crossSiteRequests["a link on another site"] })

        const response = yield* browser.authGet(link.replace("/api/auth", ""))

        assert.strictEqual(response.status, 200)
        yield* browser.reloadCsrf
        assert.deepInclude(yield* browser.rpc((api) => api.getMe()), { success: true })
      }),
    )

    // Older Safari sends no `Sec-Fetch-*` at all, so the app's header has to be enough.
    it.live(`/${route} works from a browser that sends no fetch metadata`, () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        const link = yield* craft(app)
        const browser = yield* makeBrowser(app)

        const response = yield* browser.request(link, { headers: appRequestHeaders })

        assert.strictEqual(response.status, 200)
        yield* browser.reloadCsrf
        assert.deepInclude(yield* browser.rpc((api) => api.getMe()), { success: true })
      }),
    )

    it.live(`/${route} grants no CORS preflight for the app's header`, () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        const link = yield* craft(app)

        const preflight = yield* app.request(`${testOrigin}${link}`, {
          method: "OPTIONS",
          headers: {
            origin: evilOrigin,
            "access-control-request-method": "GET",
            "access-control-request-headers": appRequestHeader,
          },
        })

        assert.isFalse(preflight.ok, String(preflight.status))
        assert.isFalse(preflight.headers.has("access-control-allow-origin"))
        assert.isFalse(preflight.headers.has("access-control-allow-headers"))
        assert.isFalse(preflight.headers.has("access-control-allow-credentials"))
      }),
    )
  }
})

describe("plain HTTP", () => {
  it.live("can't register: only the https origin is accepted", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const email = uniqueEmail()
      const response = yield* app.request(`${testOrigin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { origin: "http://petitionu.test", "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "correct horse battery",
          passwordConfirmation: "correct horse battery",
          name: "",
        }),
      })

      assert.strictEqual(response.status, 403)
      assert.isEmpty(response.headers.getSetCookie())
      assert.isEmpty(yield* app.sql`SELECT 1 FROM users WHERE email = ${email}`.pipe(Effect.orDie))
    }),
  )
})

describe("other ways to sign a browser in from another site", () => {
  const crossSitePost = (app: TestApp, path: string, contentType: string, body: unknown) =>
    app.request(`${testOrigin}/api/auth${path}`, {
      method: "POST",
      headers: {
        origin: evilOrigin,
        "content-type": contentType,
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
      body: JSON.stringify(body),
    })

  const credentials = {
    email: "owner@example.edu",
    password: "correct horse battery",
    passwordConfirmation: "correct horse battery",
    name: "",
  }

  // A page must not be able to register an address, or try its password, from a visitor's browser.
  for (const path of ["/sign-up/email", "/sign-in/email"]) {
    it.live(`${path} rejects a cross-site POST`, () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        const response = yield* crossSitePost(app, path, "application/json", credentials)
        assert.strictEqual(response.status, 403)
        assert.isEmpty(response.headers.getSetCookie())
      }),
    )
  }

  // A form can't send JSON, and a page's `fetch` can't without a CORS preflight the app refuses.
  it.live("/reset-password refuses what a cross-site form can send", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      for (const contentType of [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
      ]) {
        const response = yield* crossSitePost(app, "/reset-password", contentType, {
          token: "attacker-token",
          newPassword: "a brand new passphrase",
        })
        assert.strictEqual(response.status, 415, contentType)
      }
    }),
  )

  it.live("/reset-password/:token only redirects: it neither signs in nor spends the token", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const attacker = yield* registerUser(app)
      const browser = yield* makeBrowser(app)
      const { token } = yield* withEmailTo(
        app,
        attacker.email,
        browser.auth("/request-password-reset", { email: attacker.email }),
      )

      const victim = yield* makeBrowser(app)
      const response = yield* victim.request(
        `/api/auth/reset-password/${token}?callbackURL=/reset`,
        {
          headers: { origin: "", ...crossSiteRequests["a link on another site"] },
        },
      )

      assert.strictEqual(response.status, 302)
      assert.isUndefined(victim.cookie("session_token"))
      const reset = yield* browser.auth("/reset-password", {
        token,
        newPassword: "a brand new passphrase",
        newPasswordConfirmation: "a brand new passphrase",
      })
      assert.strictEqual(reset.status, 200)
    }),
  )
})
