import { ActorMiddleware, CurrentActor, CurrentUser, RequireUser } from "@petitionu/domain"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { rpcRoute } from "../src/Rpc.ts"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { makeTestApp, testOrigin } from "./support/harness.ts"
import { createOrganization, createUser } from "./support/users.ts"

/** A test-only group: one public procedure and one that needs a signed-in user. */
class ProbeRpcs extends RpcGroup.make(
  Rpc.make("whoIsCalling", { success: Schema.String }),
  Rpc.make("signedInOnly", { success: Schema.String }).middleware(RequireUser),
).middleware(ActorMiddleware) {}

const ProbeRoutes = rpcRoute(ProbeRpcs, "/rpc-probe").pipe(
  Layer.provide(
    ProbeRpcs.toLayer({
      whoIsCalling: () =>
        CurrentActor.useSync((actor) =>
          actor._tag === "SignedIn" ? `${actor.role}:${actor.email}` : "guest",
        ),
      signedInOnly: () => CurrentUser.useSync((user) => user.id),
    }),
  ),
)

const probe = (browser: Browser, tag: "whoIsCalling" | "signedInOnly") =>
  Effect.gen(function* () {
    const response = yield* browser.request("/rpc-probe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": yield* browser.reloadCsrf,
        origin: testOrigin,
      },
      body: JSON.stringify({ _tag: "Request", id: "1", tag, payload: null, headers: [] }),
    })
    assert.strictEqual(response.status, 200)
    const [message] = (yield* Effect.promise(() => response.json())) as Array<{ exit: any }>
    return message!.exit
  })

describe("current actor", () => {
  it.live("public procedures see a guest or the signed-in user", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp({ routes: ProbeRoutes })
      const guest = yield* makeBrowser(app)
      assert.deepStrictEqual(yield* probe(guest, "whoIsCalling"), {
        _tag: "Success",
        value: "guest",
      })
      const user = yield* createUser(app, { stage: "unconfirmed", role: "professor" })
      assert.deepStrictEqual(yield* probe(user.browser, "whoIsCalling"), {
        _tag: "Success",
        value: `professor:${user.email}`,
      })
    }),
  )

  it.live("sign-in-only procedures reject guests with Unauthenticated", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp({ routes: ProbeRoutes })
      const guest = yield* makeBrowser(app)
      const rejected = yield* probe(guest, "signedInOnly")
      assert.strictEqual(rejected._tag, "Failure")
      assert.deepInclude(JSON.stringify(rejected), "Unauthenticated")
      assert.deepInclude(JSON.stringify(rejected), "Sign in to access petition activity.")

      const user = yield* createUser(app, { stage: "unconfirmed" })
      assert.deepStrictEqual(yield* probe(user.browser, "signedInOnly"), {
        _tag: "Success",
        value: user.id,
      })
      yield* user.browser.auth("/sign-out")
      assert.strictEqual((yield* probe(user.browser, "signedInOnly"))._tag, "Failure")
    }),
  )
})

describe("getMe", () => {
  it.live("is not found for a guest, as the web app's auth context expects", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const guest = yield* makeBrowser(app)
      const result = yield* guest.rpc((api) => api.getMe())
      assert.deepStrictEqual(result, {
        success: false,
        errors: [{ type: "not_found", message: "User not found" }],
      })
    }),
  )

  it.live("returns the signed-in user's own account", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const organization = yield* createOrganization(app, { name: "Example State" })
      const user = yield* createUser(app, {
        organizationId: organization.id,
        firstName: "Ada",
        lastName: "Lovelace",
        role: "admin",
      })
      yield* app.sql`UPDATE users SET graduation_year = 2028 WHERE id = ${user.id}`.pipe(
        Effect.orDie,
      )
      const result = yield* user.browser.rpc((api) => api.getMe())
      if (!result.success) return assert.fail(JSON.stringify(result))
      const { insertedAt, ...rest } = result.data
      assert.deepStrictEqual(rest, {
        id: user.id,
        email: user.email,
        firstName: "Ada",
        lastName: "Lovelace",
        role: "admin",
        graduationYear: 2028,
        emailVerified: true,
        profileComplete: true,
        organizationId: organization.id,
        organization: { id: organization.id, name: "Example State" },
        hasPassword: true,
      })
      assert.isBelow(Math.abs(insertedAt.getTime() - Date.now()), 60_000)
      // Sent with microseconds, as the Phoenix app sent it; a `Date` has milliseconds.
      const sent = yield* user.browser.rawRpc("getMe")
      assert.match(sent.value.insertedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}000Z$/)
      assert.strictEqual(sent.value.insertedAt, `${insertedAt.toISOString().slice(0, 23)}000Z`)
    }),
  )

  it.live("an unconfirmed user's profile is incomplete", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const user = yield* createUser(app, { stage: "unconfirmed" })
      const result = yield* user.browser.rpc((api) => api.getMe())
      if (!result.success) return assert.fail(JSON.stringify(result))
      assert.include(result.data, {
        emailVerified: false,
        profileComplete: false,
        organizationId: null,
        organization: null,
        role: "student",
      })
    }),
  )
})
