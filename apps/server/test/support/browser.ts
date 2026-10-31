import { type ApiClient, makeApiClient } from "@petitionu/domain"
import { Effect } from "effect"
import { type TestApp, testOrigin } from "./harness.ts"

let nextAddress = 1

/**
 * A simulated browser on the app's own origin: it keeps cookies, sends `Origin` like a
 * browser's `fetch`, and calls RPC procedures through the shared client with its CSRF token.
 * Each browser has its own client IP, so rate limits don't leak between browsers.
 */
export interface Browser {
  readonly ip: string
  /** Sends a request with this browser's cookies and stores the cookies it sets. */
  request(path: string, init?: RequestInit): Effect.Effect<Response>
  /** POSTs JSON to a Better Auth endpoint (`/api/auth` + `path`); returns status and body. */
  auth(path: string, body?: unknown): Effect.Effect<{ readonly status: number; readonly body: any }>
  /** GETs a Better Auth endpoint (`/api/auth` + `path`); returns status and body. */
  authGet(path: string): Effect.Effect<{ readonly status: number; readonly body: any }>
  /** The cookie value named `name` (any prefix), if set. */
  cookie(name: string): string | undefined
  /** The cookie header this browser sends. */
  readonly cookieHeader: () => string
  /** Fetches a fresh CSRF token, as the web app does after signing in or out. */
  readonly reloadCsrf: Effect.Effect<string>
  /** Calls procedures through the shared client, with this browser's cookies and CSRF token. */
  rpc<A>(call: (api: ApiClient) => Promise<A>): Effect.Effect<A>
  /**
   * Calls a procedure past the shared client and returns the response's exit as sent, before
   * any decoding: what a caller that skips the client sees.
   */
  rawRpc(tag: string, payload?: unknown): Effect.Effect<any>
}

const json = (response: Response) =>
  Effect.promise(async () => {
    const text = await response.text()
    try {
      return text === "" ? null : JSON.parse(text)
    } catch {
      return text
    }
  })

export const makeBrowser = (app: TestApp): Effect.Effect<Browser> =>
  Effect.gen(function* () {
    const ip = `198.51.100.${nextAddress++ % 250}`
    const jar = new Map<string, string>()
    let csrfToken = ""

    const cookieHeader = () => Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ")

    const store = (response: Response) => {
      for (const header of response.headers.getSetCookie()) {
        const [pair = "", ...attributes] = header.split(";").map((part) => part.trim())
        const separator = pair.indexOf("=")
        const name = pair.slice(0, separator)
        const value = pair.slice(separator + 1)
        const expired = attributes.some(
          (attribute) =>
            /^max-age=(0|-)/i.test(attribute) ||
            (/^expires=/i.test(attribute) && Date.parse(attribute.slice(8)) < Date.now()),
        )
        if (expired || value === "") jar.delete(name)
        else jar.set(name, value)
      }
    }

    const send = async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(
        new URL(String(input instanceof Request ? input.url : input), testOrigin),
        {
          ...(input instanceof Request
            ? { method: input.method, body: await input.text(), headers: input.headers }
            : {}),
          ...init,
        },
      )
      const headers = new Headers(request.headers)
      headers.set("x-forwarded-for", ip)
      // An empty `origin` sends none, like a request made outside a browser.
      if (!headers.has("origin")) headers.set("origin", testOrigin)
      else if (headers.get("origin") === "") headers.delete("origin")
      if (jar.size > 0) headers.set("cookie", cookieHeader())
      const response = await Effect.runPromise(
        app.request(request.url, {
          method: request.method,
          headers,
          ...(request.method === "GET" || request.method === "HEAD"
            ? {}
            : { body: await request.text() }),
          redirect: "manual",
        }),
      )
      store(response)
      return response
    }

    const request = (path: string, init?: RequestInit) => Effect.promise(() => send(path, init))

    const auth = (path: string, body?: unknown) =>
      Effect.gen(function* () {
        const response = yield* request(`/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        })
        return { status: response.status, body: yield* json(response) }
      })

    const authGet = (path: string) =>
      Effect.gen(function* () {
        const response = yield* request(`/api/auth${path}`)
        return { status: response.status, body: yield* json(response) }
      })

    const reloadCsrf = Effect.gen(function* () {
      const response = yield* request("/rpc/csrf-token")
      const body = (yield* json(response)) as { token: string }
      csrfToken = body.token
      return csrfToken
    })

    const api = makeApiClient({
      url: `${testOrigin}/rpc`,
      fetch: ((input: string | URL | Request, init?: RequestInit) =>
        send(input, init)) as typeof globalThis.fetch,
      headers: () => (csrfToken === "" ? {} : { "x-csrf-token": csrfToken }),
    })

    const cookie = (name: string) => {
      for (const [key, value] of jar) {
        if (key === name || key.endsWith(`.${name}`)) return value
      }
      return undefined
    }

    const rawRpc = (tag: string, payload: unknown = null) =>
      Effect.gen(function* () {
        const response = yield* request("/rpc", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ _tag: "Request", id: "1", tag, payload, headers: [] }),
        })
        const [message] = (yield* json(response)) as Array<{ readonly exit: unknown }>
        return message!.exit
      })

    yield* reloadCsrf
    return {
      ip,
      request,
      auth,
      authGet,
      cookie,
      cookieHeader,
      reloadCsrf,
      rpc: (call) => Effect.promise(() => call(api)),
      rawRpc,
    } satisfies Browser
  })
