import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { request as httpRequest } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeBrowser } from "./support/browser.ts"
import { ok } from "./support/classrooms.ts"
import { makeTestApp, serveOnSocket, testOrigin } from "./support/harness.ts"
import { insertCategory } from "./support/petitions.ts"
import { createOrganization, createUser } from "./support/users.ts"

const limit = 128 * 1024
const chunkSize = 16 * 1024

/**
 * A request body that counts what's read of it: `total` bytes, sent a chunk at a time as a
 * browser or a slow client would, with nothing buffered ahead of the reader.
 */
const countedBody = (total: number) => {
  const state = { read: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (state.read >= total) return controller.close()
        state.read += chunkSize
        controller.enqueue(new Uint8Array(chunkSize).fill(32))
      },
      cancel() {
        state.cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { state, stream }
}

const streamed = (body: ReadableStream<Uint8Array>, headers: Record<string, string>) =>
  ({ method: "POST", headers, body, duplex: "half" }) as RequestInit

describe("request body limit", () => {
  it.live("rejects a declared oversized body without reading it", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const token = yield* browser.reloadCsrf
      const headers = {
        "content-type": "application/json",
        "content-length": String(limit + 1),
        origin: testOrigin,
        "x-csrf-token": token,
        cookie: browser.cookieHeader(),
      }

      for (const path of ["/rpc", "/api/auth/sign-in/email"]) {
        const { state, stream } = countedBody(limit * 8)
        const response = yield* app.request(path, streamed(stream, headers))
        assert.strictEqual(response.status, 413, path)
        assert.strictEqual(state.read, 0, path)
      }
    }),
  )

  it.live("stops reading a chunked body at the limit", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const token = yield* browser.reloadCsrf
      const headers = {
        "content-type": "application/json",
        origin: testOrigin,
        "x-csrf-token": token,
        cookie: browser.cookieHeader(),
      }

      for (const path of ["/rpc", "/api/auth/sign-in/email"]) {
        const { state, stream } = countedBody(limit * 8)
        const response = yield* app.request(path, streamed(stream, headers))
        assert.strictEqual(response.status, 413, path)
        assert.deepStrictEqual(
          yield* Effect.promise(() => response.json()),
          { error: "Request body too large" },
          path,
        )
        assert.isAtMost(state.read, limit + chunkSize, path)
        assert.isTrue(state.cancelled, path)
      }
    }),
  )

  it.live("keeps the origin and CSRF checks first on /rpc", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const { state, stream } = countedBody(limit * 8)
      const response = yield* app.request(
        "/rpc",
        streamed(stream, { "content-type": "application/json", origin: testOrigin }),
      )
      assert.strictEqual(response.status, 403)
      assert.strictEqual(state.read, 0)
    }),
  )

  it.live("accepts a body of exactly the limit, not a byte more", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const browser = yield* makeBrowser(app)
      const token = yield* browser.reloadCsrf
      const message = JSON.stringify({
        _tag: "Request",
        id: "1",
        tag: "supportContact",
        payload: null,
        headers: [],
      })
      const send = (size: number) =>
        browser.request("/rpc", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": token },
          // JSON ignores the padding, so the body stays a valid request at any size.
          body: message + " ".repeat(size - message.length),
        })

      assert.strictEqual((yield* send(limit)).status, 200)
      assert.strictEqual((yield* send(limit + 1)).status, 413)
    }),
  )

  it.live("leaves room for the largest payload the schemas allow", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const organization = yield* createOrganization(app, { domain: "school.edu" })
      const user = yield* createUser(app, { organizationId: organization.id })
      const category = yield* insertCategory(app, { name: "Campus" })

      // JSON sends a control character as a six-byte escape, its costliest form.
      const title = "\u0001".repeat(200)
      const description = "\u0001".repeat(20000)
      const created = yield* user.browser
        .rpc((api) => api.createPetition({ title, description, categoryId: category.id }))
        .pipe(Effect.flatMap(ok))
      assert.lengthOf(created.description ?? "", 20000)
    }),
  )

  it.live("the shared client reports a rejected body as an `unknown` error", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const organization = yield* createOrganization(app, { domain: "school.edu" })
      const user = yield* createUser(app, { organizationId: organization.id })

      // Trailing spaces pass the schema's trimmed length, so the call does go out.
      const message = `Help${" ".repeat(limit)}`
      const result = yield* user.browser.rpc((api) =>
        api.createSupportRequest({ kind: "support", message }),
      )
      assert.isFalse(result.success)
      assert.deepStrictEqual(result.success ? [] : result.errors.map(({ type }) => type), [
        "unknown",
      ])
    }),
  )

  it.live("a real server answers 413 to a chunked body and closes the connection", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "petitionu-body-limit-"))),
          (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        )
        const socketPath = join(directory, "server.sock")
        yield* serveOnSocket(socketPath)

        const send = (path: string, body: "endless" | string, headers = {}) =>
          Effect.promise(
            () =>
              new Promise<{ status: number; closed: boolean }>((resolve, reject) => {
                const request = httpRequest({
                  socketPath,
                  path,
                  method: "POST",
                  headers: {
                    host: "petitionu.test",
                    origin: testOrigin,
                    "content-type": "application/json",
                    ...headers,
                  },
                })
                let timer: NodeJS.Timeout | undefined
                request.on("response", (response) => {
                  clearInterval(timer)
                  response.resume()
                  response.on("close", () =>
                    resolve({
                      status: response.statusCode!,
                      closed: response.headers.connection === "close",
                    }),
                  )
                })
                request.on("error", reject)
                if (body !== "endless") return request.end(body)
                request.flushHeaders()
                timer = setInterval(() => request.write(Buffer.alloc(chunkSize, 32)), 1)
              }),
          )

        const auth = "/api/auth/sign-in/email"
        const endless = yield* send(auth, "endless")
        assert.deepStrictEqual(endless, { status: 413, closed: true })

        // A chunked body under the limit still goes through, over the same stream.
        const small = yield* send(
          auth,
          JSON.stringify({ email: "nobody@example.edu", password: "wrong password" }),
          { "transfer-encoding": "chunked" },
        )
        assert.strictEqual(small.status, 401)
      }),
    ),
  )
})
