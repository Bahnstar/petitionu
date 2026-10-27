import { Config, Context, Effect, Layer, type Option, type Redacted, Schema } from "effect"

/**
 * Every environment variable the server reads. Validated once at startup; secrets stay
 * redacted so they never reach logs. Variables later features need are optional until used.
 */
export interface AppSettings {
  readonly databaseUrl: Redacted.Redacted<string>
  readonly databaseSsl: boolean
  readonly poolSize: number
  /** Public host the app is reached at, e.g. `petition.your-campus.edu` or `localhost:5173`. */
  readonly publicHost: string
  readonly port: number
  /**
   * The header holding the client's address, set by the proxy in front of the app (rate limits
   * are per client). `x-forwarded-for` counts only when it holds a single address.
   */
  readonly clientIpHeader: string
  readonly betterAuthSecret: Option.Option<Redacted.Redacted<string>>
  readonly csrfSecret: Option.Option<Redacted.Redacted<string>>
  readonly resendApiKey: Option.Option<Redacted.Redacted<string>>
  readonly mailFrom: Option.Option<string>
  readonly supportEmail: Option.Option<string>
  readonly otlpEndpoint: Option.Option<URL>
  /** Directory holding the built web app (`apps/web/dist`). */
  readonly webDistDir: string
}

/** A host name with an optional port: no scheme, path or whitespace. */
const PublicHost = Schema.String.check(
  Schema.isPattern(/^[^\s/:]+(:\d+)?$/, {
    message: "must be a host name with an optional port, without a scheme, path or whitespace",
  }),
)

/** What an entry point defaults: the web app's directory, and whether it uses `PUBLIC_HOST`. */
export interface SettingsDefaults {
  readonly webDistDir: string
  /** `migrate` and `seed` build no links, so they don't need `PUBLIC_HOST`. */
  readonly publicHostUnused?: boolean
}

/**
 * `PUBLIC_HOST`, required in production when the entry point uses it; development and tests
 * default to `localhost`.
 */
const publicHost = (defaults: SettingsDefaults) =>
  Config.String("NODE_ENV").pipe(
    Config.withDefault("production"),
    Config.flatMap((env) => {
      const host = Config.schema(PublicHost, "PUBLIC_HOST")
      return env === "development" || env === "test" || defaults.publicHostUnused
        ? host.pipe(Config.withDefault("localhost"))
        : host
    }),
  )

export const appSettings = (defaults: SettingsDefaults) =>
  Config.all({
    databaseUrl: Config.Redacted("DATABASE_URL"),
    databaseSsl: Config.Boolean("DATABASE_SSL").pipe(Config.withDefault(false)),
    poolSize: Config.Int("POOL_SIZE").pipe(Config.withDefault(10)),
    publicHost: publicHost(defaults),
    port: Config.Port("PORT").pipe(Config.withDefault(4000)),
    clientIpHeader: Config.String("CLIENT_IP_HEADER").pipe(
      Config.withDefault(""),
      // Blank (an env file's `CLIENT_IP_HEADER=`) means unset.
      Config.map((name) => name.trim().toLowerCase() || "x-forwarded-for"),
    ),
    betterAuthSecret: Config.option(Config.Redacted("BETTER_AUTH_SECRET")),
    csrfSecret: Config.option(Config.Redacted("CSRF_SECRET")),
    resendApiKey: Config.option(Config.Redacted("RESEND_API_KEY")),
    mailFrom: Config.option(Config.String("MAIL_FROM")),
    supportEmail: Config.option(Config.String("SUPPORT_EMAIL")),
    otlpEndpoint: Config.option(Config.URL("OTEL_EXPORTER_OTLP_ENDPOINT")),
    webDistDir: Config.String("WEB_DIST_DIR").pipe(Config.withDefault(defaults.webDistDir)),
  })

export class AppConfig extends Context.Service<AppConfig, AppSettings>()("petitionu/AppConfig") {
  static readonly layer = (defaults: SettingsDefaults) =>
    Layer.effect(
      AppConfig,
      Effect.gen(function* () {
        return AppConfig.of(yield* appSettings(defaults))
      }),
    )
}
