import { safeReturnTo } from "@petitionu/domain"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { createUser } from "./support/users.ts"

describe("returning after sign-in", () => {
  it.live("a guest opening the petitions list is sent to sign in, then back", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const guest = yield* makeBrowser(app)
      const response = yield* guest.request("/ash-typescript/petitions")
      assert.strictEqual(response.status, 302)
      const location = new URL(response.headers.get("location")!, "https://petitionu.test")
      assert.strictEqual(location.pathname, "/sign-in")
      assert.strictEqual(location.searchParams.get("return_to"), "/ash-typescript/petitions")
      assert.strictEqual(
        (yield* guest.request(`${location.pathname}${location.search}`)).status,
        200,
      )

      const user = yield* createUser(app, { stage: "unconfirmed" })
      const signedIn = yield* user.browser.request("/ash-typescript/petitions")
      assert.strictEqual(signedIn.status, 200)
      assert.include(yield* Effect.promise(() => signedIn.text()), 'name="csrf-token"')
    }),
  )

  it("keeps local app destinations, with query and fragment", () => {
    for (const destination of [
      "/ash-typescript",
      "/ash-typescript/dashboard",
      "/ash-typescript/create?classroomId=class-1#details",
    ]) {
      assert.strictEqual(safeReturnTo(destination), destination)
    }
  })

  it("rejects external URLs, authentication loops, malformed values and path tricks", () => {
    for (const destination of [
      undefined,
      null,
      {},
      ["/ash-typescript"],
      "",
      "ash-typescript",
      "https://example.com",
      "//example.com",
      "/\\example.com",
      "/%5cexample.com",
      "/sign-in",
      "/auth/user/password/sign_in",
      "/ash-typescript/../sign-in",
      "/ash-typescript/%2e%2e/sign-in",
      "/ash-typescript/%5cexample.com",
      "/ash-typescript//example.com",
      "/ash-typescript\n",
      "/ash-typescript/%0a",
      "/ash-typescriptevil",
      "/ash-typescript/%zz",
    ]) {
      assert.isUndefined(safeReturnTo(destination), JSON.stringify(destination))
    }
  })
})
