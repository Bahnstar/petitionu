import { NodeSocket } from "@effect/platform-node"
import { EmailDomain } from "@petitionu/domain"
import { Context, Duration, Effect, Layer, Schema, Stream } from "effect"
import { Socket } from "effect/socket"

/**
 * Why a registry lookup didn't confirm a school. Stored as-is on the organization
 * (`registry_error`), so the values match the existing column.
 */
export const SchoolRegistryFailure = Schema.Literals([
  "unavailable",
  "not_found",
  "inconclusive",
  "unsupported_domain",
])
export type SchoolRegistryFailure = typeof SchoolRegistryFailure.Type

export class SchoolRegistryError extends Schema.TaggedError<SchoolRegistryError>()(
  "SchoolRegistryError",
  { reason: SchoolRegistryFailure },
) {}

/** A confirmed registry entry: the registrant name and the WHOIS server that returned it. */
export interface SchoolRegistration {
  readonly name: string
  readonly source: string
}

/** Sends `domain` to a WHOIS `server` and returns the raw response bytes. */
export type WhoisTransport = (
  server: string,
  domain: string,
) => Effect.Effect<Uint8Array, SchoolRegistryError>

const maxResponseBytes = 131_072
const maxNameBytes = 512

const fail = (reason: SchoolRegistryFailure) => Effect.fail(new SchoolRegistryError({ reason }))

/**
 * WHOIS over TCP port 43. Any connection or read failure, or no answer within the timeout,
 * is `unavailable`; a response over 128 KiB is `inconclusive`.
 */
export const tcpWhoisTransport =
  (
    options: {
      readonly address?: (server: string) => { readonly host: string; readonly port: number }
      readonly timeout?: Duration.Input
    } = {},
  ): WhoisTransport =>
  (server, domain) =>
    Effect.gen(function* () {
      const address = options.address?.(server) ?? { host: server, port: 43 }
      const socket = yield* NodeSocket.makeNet({ ...address, openTimeout: "5 seconds" })
      // The writer stays open until the read ends: releasing it would half-close the socket,
      // and some servers answer a half-close by closing without a response.
      const write = Effect.flatMap(socket.writer, (w) => w.write(`${domain}\r\n`))
      const read = Socket.toStream(socket).pipe(
        Stream.catchIf(isCleanClose, () => Stream.empty),
        Stream.mapError(() => new SchoolRegistryError({ reason: "unavailable" })),
        Stream.runFoldEffect(
          () => [] as Array<Uint8Array>,
          (chunks, chunk) => {
            chunks.push(chunk)
            return byteLength(chunks) > maxResponseBytes
              ? fail("inconclusive")
              : Effect.succeed(chunks)
          },
        ),
      )
      const [, chunks] = yield* Effect.all([write, read], { concurrency: "unbounded" })
      return Buffer.concat(chunks)
    }).pipe(
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: options.timeout ?? "10 seconds",
        orElse: () => fail("unavailable"),
      }),
      Effect.catchTag("SocketError", () => fail("unavailable")),
    )

const isCleanClose = (error: Socket.SocketError) =>
  error.reason._tag === "SocketCloseError" && error.reason.code === 1000

const byteLength = (chunks: ReadonlyArray<Uint8Array>) =>
  chunks.reduce((total, chunk) => total + chunk.byteLength, 0)

const servers = {
  educause: "whois.educause.edu",
  jisc: "whois.ja.net",
} as const

const serverFor = (domain: string) => {
  if (EmailDomain.fromEmail(`registry@${domain}`) !== domain) return undefined
  if (EmailDomain.schoolDomain(domain) !== domain) return undefined
  if (domain.endsWith(".edu")) return servers.educause
  if (domain.endsWith(".ac.uk")) return servers.jisc
  return undefined
}

const patterns = {
  [servers.educause]: {
    domain: /^Domain Name:[ \t]*([^\r\n]+)$/im,
    name: /^Registrant:[ \t]*\r?\n[ \t]+([^\r\n]+)$/im,
  },
  [servers.jisc]: {
    domain: /^Domain:[ \t]*\r?\n[ \t]+([^\r\n]+)$/im,
    name: /^Registered For:[ \t]*\r?\n[ \t]+([^\r\n]+)$/im,
  },
}

const notFound = /^(?:No match for|NOT FOUND|No such domain)\b/im

const field = (response: string, pattern: RegExp) => {
  const value = pattern.exec(response)?.[1]?.trim()
  return value === "" ? undefined : value
}

const decoder = new TextDecoder("utf-8", { fatal: true })

const parse = (
  domain: string,
  server: typeof servers.educause | typeof servers.jisc,
  bytes: Uint8Array,
): Effect.Effect<SchoolRegistration, SchoolRegistryError> => {
  let response: string
  try {
    response = decoder.decode(bytes).replaceAll("\r\n", "\n")
  } catch {
    return fail("inconclusive")
  }
  const registeredDomain = field(response, patterns[server].domain)
  const name = field(response, patterns[server].name)
  if (
    registeredDomain?.toLowerCase() === domain &&
    name !== undefined &&
    Buffer.byteLength(name) <= maxNameBytes
  ) {
    return Effect.succeed({ name, source: server })
  }
  return fail(notFound.test(response) ? "not_found" : "inconclusive")
}

/**
 * Checks a school domain against its authoritative WHOIS registry (EDUCAUSE for `.edu`,
 * Jisc for `.ac.uk`). A match confirms the registry entry, not current accreditation.
 * Only the registrant name and the registry server are kept.
 */
export class SchoolRegistry extends Context.Service<
  SchoolRegistry,
  {
    lookup(domain: string): Effect.Effect<SchoolRegistration, SchoolRegistryError>
  }
>()("petitionu/SchoolRegistry") {
  static readonly layerWithTransport = (transport: WhoisTransport) =>
    Layer.succeed(SchoolRegistry)({
      lookup: Effect.fn("SchoolRegistry.lookup")(function* (domain: string) {
        const server = serverFor(domain)
        if (server === undefined) return yield* fail("unsupported_domain")
        const response = yield* transport(server, domain)
        return yield* parse(domain, server, response)
      }),
    })

  static readonly layer = SchoolRegistry.layerWithTransport(tcpWhoisTransport())
}
