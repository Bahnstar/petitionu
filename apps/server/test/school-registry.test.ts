import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { createServer } from "node:net"
import {
  SchoolRegistry,
  SchoolRegistryError,
  type WhoisTransport,
  tcpWhoisTransport,
} from "../src/SchoolRegistry.ts"

const encode = (text: string) => new TextEncoder().encode(text)

const respond =
  (expected: { readonly server: string; readonly domain: string }, response: string | Uint8Array) =>
  (server: string, domain: string) => {
    assert.deepStrictEqual({ server, domain }, expected)
    return Effect.succeed(typeof response === "string" ? encode(response) : response)
  }

const lookup = (domain: string, transport: WhoisTransport) =>
  SchoolRegistry.use((registry) => registry.lookup(domain)).pipe(
    Effect.provide(SchoolRegistry.layerWithTransport(transport)),
  )

const failureOf = (domain: string, transport: WhoisTransport) =>
  lookup(domain, transport).pipe(
    Effect.flip,
    Effect.map((error) => error.reason),
  )

describe("SchoolRegistry", () => {
  it.effect("extracts only the registrant name from an EDUCAUSE response", () =>
    Effect.gen(function* () {
      const response = [
        "Domain Name: SCHOOL.EDU",
        "",
        "Registrant:",
        "\tExample University",
        "\t123 Main Street",
        "",
        "Administrative Contact:",
        "\tA Person",
        "",
      ].join("\n")
      const result = yield* lookup(
        "school.edu",
        respond({ server: "whois.educause.edu", domain: "school.edu" }, response),
      )
      assert.deepStrictEqual(result, { name: "Example University", source: "whois.educause.edu" })
    }),
  )

  it.effect("parses Jisc's field names with CRLF line endings", () =>
    Effect.gen(function* () {
      const response = "Domain:\r\n\tox.ac.uk\r\n\r\nRegistered For:\r\n\tUniversity of Oxford\r\n"
      const result = yield* lookup(
        "ox.ac.uk",
        respond({ server: "whois.ja.net", domain: "ox.ac.uk" }, response),
      )
      assert.deepStrictEqual(result, { name: "University of Oxford", source: "whois.ja.net" })
    }),
  )

  it.effect(
    "missing names, mismatched domains, rate limits, and invalid text remain unverified",
    () =>
      Effect.gen(function* () {
        for (const response of [
          "Domain Name: SCHOOL.EDU\n",
          "Domain Name: OTHER.EDU\nRegistrant:\n\tAnother School\n",
          "Query rate limit exceeded",
          new Uint8Array([255]),
          "",
        ]) {
          const reason = yield* failureOf("school.edu", () =>
            Effect.succeed(typeof response === "string" ? encode(response) : response),
          )
          assert.strictEqual(reason, "inconclusive", String(response))
        }
      }),
  )

  it.effect("rejects registrant names longer than 512 bytes", () =>
    Effect.gen(function* () {
      const name = "é".repeat(257)
      const reason = yield* failureOf("school.edu", () =>
        Effect.succeed(encode(`Domain Name: SCHOOL.EDU\nRegistrant:\n\t${name}\n`)),
      )
      assert.strictEqual(reason, "inconclusive")
    }),
  )

  it.effect("distinguishes missing records and unavailable registries", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* failureOf("school.edu", () => Effect.succeed(encode("No match for SCHOOL.EDU\n"))),
        "not_found",
      )
      assert.strictEqual(
        yield* failureOf("school.edu", () =>
          Effect.fail(new SchoolRegistryError({ reason: "unavailable" })),
        ),
        "unavailable",
      )
    }),
  )

  it.effect("never queries a server for an unsupported or malformed domain", () =>
    Effect.gen(function* () {
      const transport = () => Effect.die("unexpected registry request")
      for (const domain of [
        "gmail.com",
        "school.edu.attacker.com",
        "school.edu\r\nother.edu",
        "ac.uk",
        "students.school.edu",
      ]) {
        assert.strictEqual(yield* failureOf(domain, transport), "unsupported_domain", domain)
      }
    }),
  )
})

const withWhoisServer = <A, E>(
  handle: (query: string) => string | undefined,
  use: (port: number) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(
    Effect.callback<ReturnType<typeof createServer>>((resume) => {
      const server = createServer((socket) => {
        socket.once("data", (data) => {
          const reply = handle(data.toString())
          if (reply === undefined) return
          socket.end(reply)
        })
      }).listen(0, "127.0.0.1", () => resume(Effect.succeed(server)))
    }),
    (server) => use((server.address() as { port: number }).port),
    (server) =>
      Effect.callback<void>((resume) => {
        server.close(() => resume(Effect.void))
        server.unref()
      }),
  )

describe("TCP WHOIS transport", () => {
  it.live("sends the domain on one line and reads until the registry closes", () =>
    withWhoisServer(
      (query) => `you asked: ${JSON.stringify(query)}\n`,
      (port) =>
        Effect.gen(function* () {
          const transport = tcpWhoisTransport({ address: () => ({ host: "127.0.0.1", port }) })
          const bytes = yield* transport("whois.educause.edu", "school.edu")
          assert.strictEqual(new TextDecoder().decode(bytes), 'you asked: "school.edu\\r\\n"\n')
        }),
    ),
  )

  it.live("reports an unreachable registry as unavailable", () =>
    Effect.gen(function* () {
      const port = yield* withWhoisServer(
        () => undefined,
        (port) => Effect.succeed(port),
      )
      const transport = tcpWhoisTransport({ address: () => ({ host: "127.0.0.1", port }) })
      const error = yield* Effect.flip(transport("whois.educause.edu", "school.edu"))
      assert.strictEqual(error.reason, "unavailable")
    }),
  )

  it.live("treats an oversized response as inconclusive", () =>
    withWhoisServer(
      () => "x".repeat(200_000),
      (port) =>
        Effect.gen(function* () {
          const transport = tcpWhoisTransport({ address: () => ({ host: "127.0.0.1", port }) })
          const error = yield* Effect.flip(transport("whois.educause.edu", "school.edu"))
          assert.strictEqual(error.reason, "inconclusive")
        }),
    ),
  )

  it.live("gives up on a registry that never answers", () =>
    withWhoisServer(
      () => undefined,
      (port) =>
        Effect.gen(function* () {
          const transport = tcpWhoisTransport({
            address: () => ({ host: "127.0.0.1", port }),
            timeout: "200 millis",
          })
          const error = yield* Effect.flip(transport("whois.educause.edu", "school.edu"))
          assert.strictEqual(error.reason, "unavailable")
        }),
    ),
  )
})
