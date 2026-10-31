import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeTestApp } from "./support/harness.ts"

const text = (response: Response) => Effect.promise(() => response.text())

describe("static files", () => {
  it.live("serves hashed build assets with a long-lived cache", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const response = yield* app.request("/assets/index-fixture.js")
      assert.strictEqual(response.status, 200)
      assert.match(response.headers.get("content-type") ?? "", /^text\/javascript/)
      assert.strictEqual(
        response.headers.get("cache-control"),
        "public, max-age=31536000, immutable",
      )
      assert.include(yield* text(response), "fixture")
    }),
  )

  it.live("serves other public files and 404s for missing ones", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const robots = yield* app.request("/robots.txt")
      assert.strictEqual(robots.status, 200)
      assert.include(yield* text(robots), "User-agent")
      const missing = yield* app.request("/assets/nope.js")
      assert.strictEqual(missing.status, 404)
    }),
  )
})

describe("SPA shell", () => {
  it.live("serves the shell for the app root and any route under it", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      for (const path of ["/ash-typescript", "/ash-typescript/petitions/abc?tab=comments"]) {
        const response = yield* app.request(path)
        assert.strictEqual(response.status, 200, path)
        assert.match(response.headers.get("content-type") ?? "", /^text\/html/)
        assert.strictEqual(response.headers.get("cache-control"), "no-store")
        const html = yield* text(response)
        assert.include(html, "<title>PetitionU fixture</title>")
        assert.notInclude(html, "petitionu:head")
      }
    }),
  )

  it.live("serves the shell for every auth page, including emailed links", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const paths = [
        "/sign-in",
        "/sign-in?return_to=%2Fash-typescript%2Fpetitions",
        "/register",
        "/reset",
        "/reset?token=abc",
        "/auth/confirm?token=abc",
        "/auth/magic?token=abc",
      ]
      for (const path of paths) {
        const response = yield* app.request(path, { redirect: "manual" })
        assert.strictEqual(response.status, 200, path)
        assert.match(response.headers.get("content-type") ?? "", /^text\/html/, path)
        assert.include(yield* text(response), "<title>PetitionU fixture</title>", path)
      }
    }),
  )

  it.live("redirects the site root to the app", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const response = yield* app.request("/", { redirect: "manual" })
      assert.strictEqual(response.status, 302)
      assert.strictEqual(response.headers.get("location"), "/ash-typescript")
    }),
  )
})
