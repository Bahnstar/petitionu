import { signInPath } from "@petitionu/domain"
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { Config, Context, Effect, Layer, Option } from "effect"
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from "effect/http"
import { Auth, type AuthSession, devOrigin, requireSecret } from "./Auth.ts"
import { AppConfig } from "./Config.ts"
import { ShellHead, type ShellHeadResult } from "./Web.ts"

/** Signed cookie that binds a guest's CSRF token to their browser. */
export const guestCookieName = "__Host-petitionu.guest"

const escapeAttribute = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")

/**
 * CSRF tokens for `POST /rpc`. A signed-in browser's token is an HMAC of its session token; a
 * guest's is an HMAC of a random value kept in a signed cookie. Requests must also come from
 * the app's own origin and send JSON.
 */
export class Csrf extends Context.Service<
  Csrf,
  {
    /** The token for this request's browser; sets the guest cookie on `response` when needed. */
    issue(
      request: HttpServerRequest.HttpServerRequest,
      session: Option.Option<AuthSession>,
    ): {
      readonly token: string
      readonly withCookie: (
        response: HttpServerResponse.HttpServerResponse,
      ) => HttpServerResponse.HttpServerResponse
    }
    /** Whether a state-changing request passes the origin, content type and token checks. */
    check(
      request: HttpServerRequest.HttpServerRequest,
      session: Option.Option<AuthSession>,
    ): boolean
  }
>()("petitionu/Csrf") {
  static readonly layer = Layer.effect(
    Csrf,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const secret = yield* requireSecret("CSRF_SECRET", config.csrfSecret)
      const env = yield* Config.String("NODE_ENV").pipe(Config.withDefault("production"))
      const origin = `https://${config.publicHost}`
      const trustedOrigins = new Set(env === "development" ? [origin, devOrigin] : [origin])

      const hmac = (purpose: string, value: string) =>
        createHmac("sha256", secret).update(`${purpose}:${value}`).digest("base64url")

      const equal = (a: string, b: string) => {
        const left = Buffer.from(a)
        const right = Buffer.from(b)
        return left.length === right.length && timingSafeEqual(left, right)
      }

      /** The random value in a valid guest cookie. */
      const guestNonce = (request: HttpServerRequest.HttpServerRequest) => {
        const [nonce, signature] = (request.cookies[guestCookieName] ?? "").split(".")
        return nonce && signature && equal(signature, hmac("guest-cookie", nonce))
          ? nonce
          : undefined
      }

      const expectedToken = (
        request: HttpServerRequest.HttpServerRequest,
        session: Option.Option<AuthSession>,
      ) => {
        if (Option.isSome(session)) return hmac("session", session.value.token)
        const nonce = guestNonce(request)
        return nonce === undefined ? undefined : hmac("guest", nonce)
      }

      const issue = (
        request: HttpServerRequest.HttpServerRequest,
        session: Option.Option<AuthSession>,
      ) => {
        const token = expectedToken(request, session)
        if (token !== undefined)
          return {
            token,
            withCookie: (response: HttpServerResponse.HttpServerResponse) => response,
          }
        const nonce = randomBytes(32).toString("base64url")
        return {
          token: hmac("guest", nonce),
          withCookie: HttpServerResponse.setCookieUnsafe(
            guestCookieName,
            `${nonce}.${hmac("guest-cookie", nonce)}`,
            { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
          ),
        }
      }

      const sameOrigin = (request: HttpServerRequest.HttpServerRequest) => {
        const fetchSite = request.headers["sec-fetch-site"]
        if (fetchSite !== undefined && fetchSite !== "same-origin") return false
        const requestOrigin = request.headers["origin"]
        if (requestOrigin !== undefined) return trustedOrigins.has(requestOrigin)
        return fetchSite === "same-origin"
      }

      const check = (
        request: HttpServerRequest.HttpServerRequest,
        session: Option.Option<AuthSession>,
      ) => {
        const contentType = request.headers["content-type"] ?? ""
        if (!/^application\/json\s*(;|$)/i.test(contentType)) return false
        if (!sameOrigin(request)) return false
        const expected = expectedToken(request, session)
        const sent = request.headers["x-csrf-token"]
        return expected !== undefined && sent !== undefined && equal(sent, expected)
      }

      return Csrf.of({ issue, check })
    }),
  )
}

/** Pages a guest is sent to sign in for, returning there afterwards. */
const signedInPages = new Set(["/ash-typescript/petitions"])

/**
 * Renders the shell's `<meta name="csrf-token">` for the browser's session or guest cookie,
 * and redirects a guest from the petitions list to sign-in.
 */
export const SessionShellHead = Layer.effect(
  ShellHead,
  Effect.gen(function* () {
    const csrf = yield* Csrf
    const auth = yield* Auth
    return (request: HttpServerRequest.HttpServerRequest) =>
      Effect.map(auth.getSession(new Headers(request.headers)), (session): ShellHeadResult => {
        const path = request.url.split("?")[0]!
        if (Option.isNone(session) && signedInPages.has(path)) {
          return { html: "", redirect: signInPath(path) }
        }
        const { token, withCookie } = csrf.issue(request, session)
        return {
          html: `<meta name="csrf-token" content="${escapeAttribute(token)}">`,
          decorate: withCookie,
        }
      })
  }),
)

/** `GET /rpc/csrf-token`: a fresh token, for the web app to reload after signing in or out. */
export const CsrfRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const csrf = yield* Csrf
    const auth = yield* Auth
    yield* router.add("GET", "/rpc/csrf-token", (request) =>
      Effect.gen(function* () {
        const session = yield* auth.getSession(new Headers(request.headers))
        const { token, withCookie } = csrf.issue(request, session)
        return withCookie(
          HttpServerResponse.jsonUnsafe({ token }).pipe(
            HttpServerResponse.setHeader("cache-control", "no-store"),
          ),
        )
      }),
    )
  }),
)
