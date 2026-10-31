import { Fiber, Effect, Layer } from "effect"
import { RpcSerialization } from "effect/rpc"

/** What a client sees of any defect. The detail stays in the server's logs. */
export const internalError = "Something went wrong. Please try again."

interface EncodedReason {
  readonly _tag: string
  readonly defect?: unknown
}

interface EncodedResponse {
  readonly _tag: string
  readonly defect?: unknown
  readonly exit?: { readonly _tag: string; readonly cause?: ReadonlyArray<EncodedReason> }
}

/** Logs a defect nothing has logged yet (see `ActorMiddlewareLive`) and returns its stand-in. */
const redact = (defect: unknown) => {
  const fiber = Fiber.getCurrent()
  if (fiber !== undefined && defect !== internalError) {
    Effect.runForkWith(fiber.context)(Effect.logError("RPC defect", defect))
  }
  return internalError
}

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
 */
export const RedactedJsonSerialization = Layer.succeed(RpcSerialization.RpcSerialization)({
  ...RpcSerialization.json,
  makeUnsafe: () => {
    const parser = RpcSerialization.json.makeUnsafe()
    return {
      decode: parser.decode,
      encode: (responses) =>
        parser.encode((responses as ReadonlyArray<EncodedResponse>).map(redactResponse)),
    }
  },
})
