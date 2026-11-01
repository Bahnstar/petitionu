import { Fiber, Effect, Layer } from "effect"
import { RpcSerialization } from "effect/rpc"

/** What a client sees of any defect. The detail stays in the server's logs. */
export const internalError = "Something went wrong. Please try again."

interface EncodedMessage {
  readonly _tag?: unknown
  readonly headers?: unknown
}

interface EncodedReason {
  readonly _tag: string
  readonly defect?: unknown
}

interface EncodedResponse {
  readonly _tag: string
  readonly defect?: unknown
  readonly exit?: { readonly _tag: string; readonly cause?: ReadonlyArray<EncodedReason> }
}

/** Longest text of a caller's mistake to log: a message can quote most of a request's body. */
const maxLoggedChars = 500

const logInRequest = (log: Effect.Effect<void>) => {
  const fiber = Fiber.getCurrent()
  if (fiber !== undefined) Effect.runForkWith(fiber.context)(log)
}

const logRejected = (problem: string) =>
  logInRequest(Effect.logWarning("Rejected RPC request", problem.slice(0, maxLoggedChars)))

/**
 * Logs a defect nothing has logged yet (see `ActorMiddlewareLive`) and returns its stand-in.
 * Procedures' defects are gone by now, and `decode` stops messages `RpcServer` would trip over,
 * so what `RpcServer` words as a string is the caller's mistake (an unknown tag or id, a rejected
 * payload), unless it's about a response. Anything else is the server's fault.
 */
const redact = (defect: unknown) => {
  if (defect === internalError) return internalError
  if (typeof defect === "string" && !defect.startsWith("Failed to encode response")) {
    logRejected(defect)
  } else {
    logInRequest(Effect.logError("RPC defect", defect))
  }
  return internalError
}

const isHeader = (header: unknown) =>
  Array.isArray(header) && header.length === 2 && header.every((part) => typeof part === "string")

/** Whether `RpcServer` can read `message`. It throws a `TypeError` on most other shapes. */
const isReadable = (message: EncodedMessage | null) =>
  typeof message === "object" &&
  message !== null &&
  (message._tag !== "Request" ||
    (Array.isArray(message.headers) && message.headers.every(isHeader)))

const redactResponse = (response: EncodedResponse): EncodedResponse => {
  if (response._tag === "Defect") return { ...response, defect: redact(response.defect) }
  if (response._tag !== "Exit" || response.exit?.cause === undefined) return response
  const cause = response.exit.cause.map((reason) =>
    reason._tag === "Die" ? { ...reason, defect: redact(reason.defect) } : reason,
  )
  return { ...response, exit: { ...response.exit, cause } }
}

/**
 * JSON serialization that sends every defect as `internalError`. Redacting here rather than with
 * a `defect` schema on each `Rpc.make` covers what those schemas can't: `RpcServer` encodes a
 * handler's defect, an unreadable request and an unknown message with a fixed `Schema.Defect()`.
 * The client's decoding is unchanged: a defect is a string, reported as an `unknown` error.
 * A caller can send anything, so what's wrong with a request is logged as a warning, cut short.
 */
export const RedactedJsonSerialization = Layer.succeed(RpcSerialization.RpcSerialization)({
  ...RpcSerialization.json,
  makeUnsafe: () => {
    const parser = RpcSerialization.json.makeUnsafe()
    return {
      decode: (data) => {
        let messages: ReadonlyArray<unknown>
        try {
          messages = parser.decode(data)
        } catch (cause) {
          logRejected(String(cause))
          throw internalError
        }
        if (!messages.every((message) => isReadable(message as EncodedMessage | null))) {
          logRejected(`Unreadable message: ${JSON.stringify(messages)}`)
          throw internalError
        }
        return messages
      },
      encode: (responses) =>
        parser.encode((responses as ReadonlyArray<EncodedResponse>).map(redactResponse)),
    }
  },
})
