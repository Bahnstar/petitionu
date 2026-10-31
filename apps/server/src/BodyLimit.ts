import { Effect, Option, Stream } from "effect"
import { HttpMethod, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"

/**
 * The largest request body `/rpc` and `/api/auth` read. The largest payloads hold a 200-character
 * title and a 20000-character text; JSON's costliest form of a character is a six-byte escape,
 * which comes to 121200 bytes, and the rest of the message fits in what's left.
 */
export const maxBodyBytes = 128 * 1024

const tooLarge = () =>
  HttpServerResponse.jsonUnsafe(
    { error: "Request body too large" },
    // Leaves nothing for Node to drain: a client can keep sending after the response.
    { status: 413, headers: { connection: "close" } },
  )

/** The whole body, or nothing if it passes the limit; stops reading as soon as it does. */
const readBody = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const chunks: Array<Uint8Array> = []
    let size = 0
    yield* Stream.runForEachWhile(request.stream, (chunk) =>
      Effect.sync(() => {
        size += chunk.length
        if (size > maxBodyBytes) return false
        chunks.push(chunk)
        return true
      }),
    )
    return size > maxBodyBytes ? Option.none() : Option.some(Buffer.concat(chunks))
  })

/** `request` with its body already read, for handlers that read it again. */
const withBody = (request: HttpServerRequest.HttpServerRequest, url: URL, body: Uint8Array) =>
  HttpServerRequest.fromWeb(
    new Request(url, {
      method: request.method,
      headers: request.headers,
      body: body as Uint8Array<ArrayBuffer>,
    }),
  ).modify({
    remoteAddress: request.remoteAddress,
    peerAddress: request.peerAddress,
    ...(request.protocol === undefined ? {} : { protocol: request.protocol }),
  })

const isEmptyWebRequest = (request: HttpServerRequest.HttpServerRequest) =>
  request.source instanceof Request && request.source.body === null

/**
 * Runs `httpEffect` only for a body within `maxBodyBytes`, and answers 413 otherwise. A declared
 * `Content-Length` is enough to refuse a body unread. Any other body, like a chunked one, is read
 * here up to the limit: Effect's `MaxBodySize` covers neither a Web request's reads nor the
 * stream Better Auth reads.
 */
export const limitBody = <E, R>(
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    if (!HttpMethod.hasBody(request.method) || isEmptyWebRequest(request)) return yield* httpEffect
    if (Number(request.headers["content-length"]) > maxBodyBytes) return tooLarge()
    const url = HttpServerRequest.toURL(request)
    if (Option.isNone(url)) return HttpServerResponse.empty({ status: 400 })
    const body = yield* readBody(request).pipe(Effect.orDie)
    if (Option.isNone(body)) return tooLarge()
    return yield* Effect.provideService(
      httpEffect,
      HttpServerRequest.HttpServerRequest,
      withBody(request, url.value, body.value),
    )
  })

/** `limitBody` for routes that have no guard of their own. */
export const BodyLimit = HttpRouter.middleware((httpEffect) => limitBody(httpEffect)).layer
