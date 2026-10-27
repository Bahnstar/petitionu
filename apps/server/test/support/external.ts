import { Context, Effect, Layer } from "effect"
import type { Email } from "../../src/Email.ts"
import { Mailer } from "../../src/Mailer.ts"
import {
  SchoolRegistry,
  type SchoolRegistration,
  SchoolRegistryError,
  type SchoolRegistryFailure,
} from "../../src/SchoolRegistry.ts"

/** Every link (`href`) in an email, in order, unescaped. */
export const linksIn = (email: Email): Array<string> =>
  Array.from(email.html.matchAll(/href="([^"]*)"/g), (match) =>
    match[1]!
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&"),
  )

/** In-memory Mailer for tests: records every message instead of sending it. */
export class MemoryMailer extends Context.Service<
  MemoryMailer,
  {
    readonly messages: Effect.Effect<ReadonlyArray<Email>>
    /** The most recent message sent to `to`; dies if there is none. */
    lastTo(to: string): Effect.Effect<Email>
    /** The first link in the most recent message sent to `to`. */
    lastLinkTo(to: string): Effect.Effect<URL>
  }
>()("petitionu/test/MemoryMailer") {
  /** Provides both `Mailer` and `MemoryMailer`, sharing one mailbox. */
  static readonly layer = Layer.effectContext(
    Effect.sync(() => {
      const sent: Array<Email> = []
      const lastTo = (to: string) =>
        Effect.suspend(() => {
          const message = sent.findLast((m) => m.to === to)
          return message ? Effect.succeed(message) : Effect.die(`no email sent to ${to}`)
        })
      const lastLinkTo = (to: string) =>
        Effect.flatMap(lastTo(to), (message) => {
          const [link] = linksIn(message)
          return link ? Effect.succeed(new URL(link)) : Effect.die(`no link in email to ${to}`)
        })
      return Context.make(Mailer, {
        send: (email) => Effect.sync(() => void sent.push(email)),
      }).pipe(
        Context.add(MemoryMailer, {
          messages: Effect.sync(() => [...sent]),
          lastTo,
          lastLinkTo,
        }),
      )
    }),
  )
}

/** A scripted answer for a domain; an Effect answer runs during the lookup. */
export type ScriptedLookup = (
  domain: string,
) =>
  | SchoolRegistration
  | SchoolRegistryFailure
  | Effect.Effect<SchoolRegistration | SchoolRegistryFailure>

/**
 * Scripted SchoolRegistry for tests. Answers "Registry University" from `test-registry`
 * unless a test scripts another result; records every domain looked up.
 */
export class ScriptedSchoolRegistry extends Context.Service<
  ScriptedSchoolRegistry,
  {
    /** Sets the answer for later lookups: a registration, a failure, or a function of the domain. */
    script(answer: SchoolRegistration | SchoolRegistryFailure | ScriptedLookup): Effect.Effect<void>
    readonly lookups: Effect.Effect<ReadonlyArray<string>>
  }
>()("petitionu/test/ScriptedSchoolRegistry") {
  static readonly defaultRegistration: SchoolRegistration = {
    name: "Registry University",
    source: "test-registry",
  }

  /** Provides both `SchoolRegistry` and `ScriptedSchoolRegistry`. */
  static readonly layer = Layer.effectContext(
    Effect.sync(() => {
      let answer: ScriptedLookup = () => ScriptedSchoolRegistry.defaultRegistration
      const lookups: Array<string> = []
      const lookup = (domain: string) =>
        Effect.suspend(() => {
          lookups.push(domain)
          const result = answer(domain)
          return Effect.isEffect(result) ? result : Effect.succeed(result)
        }).pipe(
          Effect.flatMap((result) =>
            typeof result === "string"
              ? Effect.fail(new SchoolRegistryError({ reason: result }))
              : Effect.succeed(result),
          ),
        )
      return Context.make(SchoolRegistry, { lookup }).pipe(
        Context.add(ScriptedSchoolRegistry, {
          script: (next) =>
            Effect.sync(() => {
              answer = typeof next === "function" ? next : () => next
            }),
          lookups: Effect.sync(() => [...lookups]),
        }),
      )
    }),
  )
}

/** Fakes for every external service, to pass as `makeAppLayer({ external })`. */
export const ExternalServicesTest = Layer.merge(MemoryMailer.layer, ScriptedSchoolRegistry.layer)
