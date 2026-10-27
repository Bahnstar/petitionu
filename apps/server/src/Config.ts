import { Config, Context, Effect, Layer, type Option, type Redacted } from "effect"

/**
 * Every environment variable the server reads. Validated once at startup; secrets stay
 * redacted so they never reach logs. Variables later features need are optional until used.
 */
export interface AppSettings {
  readonly databaseUrl: Redacted.Redacted<string>
  readonly databaseSsl: boolean
  readonly poolSize: number
  /** Public host name the app is reached at, e.g. `petition.your-campus.edu`. */
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

export const appSettings = (defaults: { readonly webDistDir: string }) =>
  Config.all({
    databaseUrl: Config.Redacted("DATABASE_URL"),
    databaseSsl: Config.Boolean("DATABASE_SSL").pipe(Config.withDefault(false)),
    poolSize: Config.Int("POOL_SIZE").pipe(Config.withDefault(10)),
    publicHost: Config.String("PUBLIC_HOST").pipe(Config.withDefault("localhost")),
    port: Config.Port("PORT").pipe(Config.withDefault(4000)),
    clientIpHeader: Config.String("CLIENT_IP_HEADER").pipe(
      Config.map((name) => name.trim().toLowerCase()),
      Config.withDefault("x-forwarded-for"),
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
  static readonly layer = (defaults: { readonly webDistDir: string }) =>
    Layer.effect(
      AppConfig,
      Effect.gen(function* () {
        return AppConfig.of(yield* appSettings(defaults))
      }),
    )
}
