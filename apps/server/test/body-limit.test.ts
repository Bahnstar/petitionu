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

interface NodeResponse {
  readonly status: number
  readonly closed: boolean
  readonly cookie: string | undefined
  readonly text: string
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

  it.live("the shared client words a rejected body for the user", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const organization = yield* createOrganization(app, { domain: "school.edu" })
      const user = yield* createUser(app, { organizationId: organization.id })

      // Trailing spaces pass the schema's trimmed length, so the call does go out.
      const message = `Help${" ".repeat(limit)}`
      const result = yield* user.browser.rpc((api) =>
        api.createSupportRequest({ kind: "support", message }),
      )
      assert.deepStrictEqual(result, {
        success: false,
        errors: [
          { type: "invalid", message: "This is too long to send. Shorten it and try again." },
        ],
      })
    }),
  )

  describe("on a real Node server", () => {
    const socketServer = Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "petitionu-body-limit-"))),
        (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      )
      const socketPath = join(directory, "server.sock")
      yield* serveOnSocket(socketPath)

      /** Sends a request as is. An `endless` body is written until the response arrives. */
      const send = (
        method: string,
        path: string,
        body: "endless" | string | undefined,
        headers: Record<string, string> = {},
      ) =>
        Effect.promise(
          () =>
            new Promise<NodeResponse>((resolve, reject) => {
              const request = httpRequest({
                socketPath,
                path,
                method,
                headers: { host: "petitionu.test", ...headers },
              })
              let timer: NodeJS.Timeout | undefined
              request.on("response", (response) => {
                clearInterval(timer)
                const chunks: Array<Buffer> = []
                response.on("data", (chunk: Buffer) => chunks.push(chunk))
                response.on("close", () =>
                  resolve({
                    status: response.statusCode!,
                    closed: response.headers.connection === "close",
                    cookie: response.headers["set-cookie"]?.[0]?.split(";")[0],
                    text: Buffer.concat(chunks).toString(),
                  }),
                )
              })
              request.on("error", reject)
              if (body !== "endless") return void request.end(body)
              request.flushHeaders()
              timer = setInterval(() => request.write(Buffer.alloc(chunkSize, 32)), 1)
            }),
        )

      const csrf = yield* send("GET", "/rpc/csrf-token", undefined)
      const headers = {
        origin: testOrigin,
        "content-type": "application/json",
        "x-csrf-token": (JSON.parse(csrf.text) as { readonly token: string }).token,
        cookie: csrf.cookie!,
      }
      return { send, headers }
    })

    const auth = "/api/auth/sign-in/email"
    const rpcMessage = JSON.stringify({
      _tag: "Request",
      id: "1",
      tag: "supportContact",
      payload: null,
      headers: [],
    })
    const chunked = { "transfer-encoding": "chunked" }

    it.live("answers 413 to a chunked body and closes the connection", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { send, headers } = yield* socketServer
          for (const path of ["/rpc", auth]) {
            const response = yield* send("POST", path, "endless", headers)
            assert.deepInclude(response, { status: 413, closed: true }, path)
          }
        }),
      ),
    )

    it.live("passes a chunked body under the limit to the handler", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { send, headers } = yield* socketServer
          const rpc = yield* send("POST", "/rpc", rpcMessage, { ...headers, ...chunked })
          assert.strictEqual(rpc.status, 200)
          assert.include(rpc.text, '"_tag":"Success"')

          const credentials = { email: "nobody@example.edu", password: "wrong password" }
          const signIn = yield* send("POST", auth, JSON.stringify(credentials), {
            ...headers,
            ...chunked,
          })
          assert.strictEqual(signIn.status, 401)
        }),
      ),
    )

    it.live("reaches the handler with an empty body", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { send, headers } = yield* socketServer
          const rpc = yield* send("POST", "/rpc", undefined, headers)
          assert.strictEqual(rpc.status, 200)
          const signIn = yield* send("POST", auth, undefined, headers)
          assert.strictEqual(signIn.status, 400)
        }),
      ),
    )
  })
})
