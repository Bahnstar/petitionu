import { assert, describe, it } from "@effect/vitest"
import { ActorMiddleware } from "@petitionu/domain"
import { Effect, Layer, Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { rpcRoute } from "../src/Rpc.ts"
import { type Browser, makeBrowser } from "./support/browser.ts"
import { makeTestApp } from "./support/harness.ts"
import { createUser } from "./support/users.ts"

const internalError = "Something went wrong. Please try again."

const leaky = "duplicate key value violates unique constraint users_unique_email_index"

/** Procedures that break the ways a real one can, past everything the API group checks. */
class BrokenRpcs extends RpcGroup.make(
  Rpc.make("dies"),
  Rpc.make("diesWithCause"),
  Rpc.make("badResponse", { success: Schema.Struct({ id: Schema.String }) }),
).middleware(ActorMiddleware) {}

const BrokenHandlers = BrokenRpcs.toLayer({
  dies: () => Effect.die(new Error(leaky)),
  diesWithCause: () =>
    Effect.die(new Error("Failed to execute statement", { cause: new Error(leaky) })),
  badResponse: () => Effect.succeed({ id: 1 } as never),
})

const brokenRoutes = rpcRoute(BrokenRpcs, "/rpc/broken").pipe(Layer.provide(BrokenHandlers))

/** Posts `body` to `path` with the browser's token; returns the response's text as sent. */
const post = (browser: Browser, path: string, body: string) =>
  Effect.gen(function* () {
    const token = yield* browser.reloadCsrf
    const response = yield* browser.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": token },
      body,
    })
    return { status: response.status, text: yield* Effect.promise(() => response.text()) }
  })

const request = (tag: string, payload: unknown = null) =>
  JSON.stringify({ _tag: "Request", id: "1", tag, payload, headers: [] })

const fatal = JSON.stringify([{ _tag: "Defect", defect: internalError }])

const failed = JSON.stringify([
  {
    _tag: "Exit",
    requestId: "1",
    exit: { _tag: "Failure", cause: [{ _tag: "Die", defect: internalError }] },
  },
])

describe("RPC defects", () => {
  it.live("a database error reaches the client as a generic `unknown` error, and the logs", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      yield* app.sql`DROP TABLE category CASCADE`.pipe(Effect.orDie)

      assert.deepStrictEqual(yield* browser.rpc((api) => api.getCategories()), {
        success: false,
        errors: [{ type: "unknown", message: internalError }],
      })

      const sent = yield* post(browser, "/rpc", request("getCategories"))
      assert.deepStrictEqual(sent, { status: 200, text: fatal })
      assert.isTrue(
        app.logs.some(
          (line) => line.startsWith("Error") && line.includes('relation "category" does not exist'),
        ),
        app.logs.join("\n"),
      )
    }),
  )

  it.live("a handler's defect and its cause chain stay in the logs", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp({ routes: brokenRoutes })
      const browser = yield* makeBrowser(app)

      for (const tag of ["dies", "diesWithCause"]) {
        const sent = yield* post(browser, "/rpc/broken", request(tag))
        assert.deepStrictEqual(sent, { status: 200, text: fatal })
      }
      const logged = app.logs.filter((line) => line.includes(leaky))
      assert.lengthOf(logged, 2, app.logs.join("\n"))
      assert.include(logged[1], "Failed to execute statement")
      assert.isTrue(
        logged.every((line) => line.startsWith("Error")),
        logged.join("\n"),
      )
    }),
  )

  it.live("a response that can't be encoded fails generically", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp({ routes: brokenRoutes })
      const browser = yield* makeBrowser(app)

      const sent = yield* post(browser, "/rpc/broken", request("badResponse"))
      assert.deepStrictEqual(sent, { status: 200, text: failed })
      assert.isTrue(
        app.logs.some(
          (line) =>
            line.startsWith("Error") &&
            line.includes('Failed to encode response for RPC \\"badResponse\\"'),
        ),
        app.logs.join("\n"),
      )
    }),
  )

  it.live("a request the server can't read fails generically", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)

      assert.deepStrictEqual(yield* post(browser, "/rpc", "{ not json"), {
        status: 200,
        text: fatal,
      })
      assert.deepStrictEqual(yield* post(browser, "/rpc", request("noSuchProcedure")), {
        status: 200,
        text: failed,
      })
      assert.deepStrictEqual(
        yield* post(browser, "/rpc", request("getPetitionById", { id: "nope" })),
        { status: 200, text: failed },
      )
      assert.isTrue(
        app.logs.some((line) => line.includes("noSuchProcedure")),
        app.logs.join("\n"),
      )
    }),
  )

  it.live("what a caller gets wrong is logged below Error, and cut short", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const message = (fields: Record<string, unknown>) =>
        JSON.stringify({ _tag: "Request", id: "1", tag: "getMe", payload: null, ...fields })

      const longTag = "x".repeat(120 * 1024)
      for (const body of [
        "{ not json",
        "",
        "null",
        "[null]",
        "123",
        "{}",
        '{"_tag":"Nope"}',
        `{"_tag":"${longTag}"}`,
        '{"_tag":"Request"}',
        message({ id: {}, headers: [] }),
        message({}),
        message({ headers: null }),
        message({ headers: [1] }),
        message({ headers: [[1, 2]] }),
        message({ tag: longTag, headers: [] }),
        message({ tag: 5, headers: [] }),
        request("getPetitionById", { id: longTag }),
        request("getPetitionById", "not an object"),
        `[${request("noSuchProcedure")},${request("noSuchProcedure")}]`,
        message({ tag: "__proto__", headers: [] }),
      ]) {
        const sent = yield* post(browser, "/rpc", body)
        assert.strictEqual(sent.status, 200, body.slice(0, 80))
        assert.notInclude(sent.text, "xxx", body.slice(0, 80))
        assert.match(sent.text, /Something went wrong/, body.slice(0, 80))
      }

      assert.isNotEmpty(app.logs)
      for (const line of app.logs) {
        assert.isTrue(line.startsWith("Warn"), line.slice(0, 200))
        assert.isBelow(line.length, 1000, line.slice(0, 200))
      }
      assert.isTrue(
        app.logs.some((line) => line.includes("Unknown request tag: xxx")),
        "the start of a long tag stays in the log",
      )
    }),
  )

  it.live("text and paging the schema refuses stay a caller's mistake in the logs", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      // Confirmed, with no profile: anyone signed in can send these.
      const { browser } = yield* createUser(app, { stage: "confirmed" })
      const id = "00000000-0000-4000-8000-000000000001"
      const petition = { description: "Better", categoryId: id }
      const alreadyLogged = app.logs.length

      for (const body of [
        request("createPetition", { ...petition, title: "a\u0000b" }),
        request("createPetition", { ...petition, title: "\u0000".repeat(10 * 1024) }),
        request("createPetition", { title: "Fine", description: "a\u0000b", categoryId: id }),
        request("createSignature", { petitionId: id, reason: "a\u0000b" }),
        request("createClassroom", { name: "Maths", description: "a\u0000b" }),
        request("inviteToClassroom", { classroomId: id, email: "a\u0000@b.edu" }),
        request("getMyClassrooms", { limit: 10, offset: 1e300 }),
        request("getMyClassrooms", { limit: 10, offset: "NaN" }),
        request("getMyClassrooms", { limit: 10, offset: "Infinity" }),
        request("getMyClassrooms", { limit: "NaN" }),
        request("getMyClassrooms", { limit: "Infinity" }),
        request("getMyClassrooms", { limit: 1e300 }),
      ]) {
        assert.deepStrictEqual(
          yield* post(browser, "/rpc", body),
          { status: 200, text: failed },
          body.slice(0, 120),
        )
      }

      const logged = app.logs.slice(alreadyLogged)
      assert.isNotEmpty(logged)
      for (const line of logged) {
        assert.isTrue(line.startsWith("Warn"), line.slice(0, 200))
        assert.isBelow(line.length, 1000, line.slice(0, 200))
      }
    }),
  )

  it.live("typed errors still reach the client in full", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)

      assert.deepStrictEqual(yield* browser.rpc((api) => api.getMe()), {
        success: false,
        errors: [{ type: "not_found", message: "User not found" }],
      })
    }),
  )
})
