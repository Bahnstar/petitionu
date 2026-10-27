import { Config, Effect, Layer, Logger, Option } from "effect"
import { FetchHttpClient } from "effect/http"
import { Otlp, OtlpSerialization } from "effect/observability"

/**
 * Structured JSON logs, one object per line. `NODE_ENV=development` switches to the
 * human-readable logger. Never log tokens, links or credentials; wrap secrets in `Redacted`.
 */
export const LoggingLive = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Config.String("NODE_ENV").pipe(Config.withDefault("production"))
    return env === "development"
      ? Logger.layer([Logger.defaultLogger])
      : Logger.layer([Logger.consoleJson])
  }),
)

/**
 * Optional OpenTelemetry export of traces, logs and metrics, on only when
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is set (the collector's base URL).
 */
export const TelemetryLive = Layer.unwrap(
  Effect.gen(function* () {
    const endpoint = yield* Config.option(Config.URL("OTEL_EXPORTER_OTLP_ENDPOINT"))
    if (Option.isNone(endpoint)) return Layer.empty
    return Otlp.layer({
      baseUrl: endpoint.value.toString(),
      resource: { serviceName: "petitionu" },
      loggerMergeWithExisting: true,
    }).pipe(Layer.provide([OtlpSerialization.layerJson, FetchHttpClient.layer]))
  }),
)

export const ObservabilityLive = Layer.merge(LoggingLive, TelemetryLive)
