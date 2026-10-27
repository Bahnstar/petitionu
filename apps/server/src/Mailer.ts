import { Config, Context, Effect, Layer, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { AppConfig } from "./Config.ts"
import type { Email } from "./Email.ts"

/** Sending failed. The message never includes the email body, so it is safe to log. */
export class MailError extends Schema.TaggedError<MailError>()("MailError", {
  message: Schema.String,
}) {}

export class MailerConfigError extends Schema.TaggedError<MailerConfigError>()(
  "MailerConfigError",
  { message: Schema.String },
) {}

/** Replaces every link in `text`, for logs: links carry tokens. */
export const redactLinks = (text: string) => text.replaceAll(/https?:\/\/\S+/g, "[link]")

const plainAddress = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/

const requireAddress = (name: string, value: Option.Option<string>) =>
  Option.isSome(value) && plainAddress.test(value.value)
    ? Effect.succeed(value.value)
    : Effect.fail(
        new MailerConfigError({ message: `${name} must be set to a plain email address` }),
      )

const resendBaseUrl = "https://api.resend.com"

/**
 * Sends email. Production sends through Resend from `PetitionU <MAIL_FROM>` with replies to
 * `SUPPORT_EMAIL`; development (`NODE_ENV=development` without `RESEND_API_KEY`) logs messages
 * instead. Tests replace it with the in-memory mailer.
 */
export class Mailer extends Context.Service<
  Mailer,
  {
    send(email: Email): Effect.Effect<void, MailError>
  }
>()("petitionu/Mailer") {
  static readonly layerResend = Layer.effect(
    Mailer,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const apiKey = Option.getOrThrow(config.resendApiKey)
      const from = yield* requireAddress("MAIL_FROM", config.mailFrom)
      const replyTo = yield* requireAddress("SUPPORT_EMAIL", config.supportEmail)
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest((request) =>
          request.pipe(
            HttpClientRequest.prependUrl(resendBaseUrl),
            HttpClientRequest.bearerToken(apiKey),
            HttpClientRequest.acceptJson,
          ),
        ),
        HttpClient.filterStatusOk,
      )
      const send = Effect.fn("Mailer.send")(
        function* (email: Email) {
          const response = yield* HttpClientRequest.post("/emails").pipe(
            HttpClientRequest.bodyJsonUnsafe({
              from: `PetitionU <${from}>`,
              to: [email.to],
              reply_to: replyTo,
              subject: email.subject,
              html: email.html,
            }),
            client.execute,
          )
          const { id } = yield* HttpClientResponse.schemaBodyJson(
            Schema.Struct({ id: Schema.String }),
          )(response)
          yield* Effect.logDebug("Mail sent", { id })
        },
        // Keep only the description: the error's request holds the body, links included.
        Effect.mapError((error) => new MailError({ message: error.message })),
      )
      return Mailer.of({ send })
    }),
  )

  static readonly layerLog = Layer.succeed(Mailer)({
    send: (email) =>
      Effect.logInfo("Mail not sent (development)", {
        to: email.to,
        subject: redactLinks(email.subject),
        html: email.html,
      }),
  })

  static readonly layerDisabled = Layer.effect(
    Mailer,
    Effect.gen(function* () {
      yield* Effect.logWarning("Mail is disabled: RESEND_API_KEY is not set")
      return Mailer.of({
        send: (email) =>
          Effect.logWarning("Mail not sent: RESEND_API_KEY is not set", {
            to: email.to,
            subject: redactLinks(email.subject),
          }).pipe(Effect.andThen(Effect.fail(new MailError({ message: "Mail is disabled" })))),
      })
    }),
  )

  /** Picks Resend when `RESEND_API_KEY` is set, otherwise logs (development) or refuses. */
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* AppConfig
      if (Option.isSome(config.resendApiKey)) return Mailer.layerResend
      const env = yield* Config.String("NODE_ENV").pipe(Config.withDefault("production"))
      return env === "development" ? Mailer.layerLog : Mailer.layerDisabled
    }),
  )
}

export const MailerLive = Mailer.layer.pipe(Layer.provide(FetchHttpClient.layer))
