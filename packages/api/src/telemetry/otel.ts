import {
  Array,
  Config,
  Effect,
  Layer,
  Option,
  pipe,
  Record,
  String,
} from 'effect'
import { FetchHttpClient } from 'effect/http'
import { OtlpSerialization, OtlpTracer } from 'effect/observability'

const parsePair = (pair: string): Option.Option<readonly [string, string]> =>
  pipe(
    String.indexOf('=')(pair),
    Option.map(
      (idx) =>
        [
          String.trim(String.slice(0, idx)(pair)),
          String.trim(String.slice(idx + 1)(pair)),
        ] as const
    )
  )

const parseHeaders = (raw: string): Record<string, string> =>
  raw === ''
    ? {}
    : pipe(
        String.split(',')(raw),
        Array.map(parsePair),
        Array.getSomes,
        Record.fromEntries
      )

/**
 * OTLP trace export through Effect's built-in exporter (no OpenTelemetry SDK).
 *
 * Traces only: `OtlpTracer` posts to `<endpoint>/v1/traces`. Logs and metrics
 * are deliberately not exported (the full `Otlp.layer` would start shipping
 * both to Honeycomb). Honeycomb routes by `service.name`, so the resource
 * name must stay `lily-api`.
 */
export const TelemetryLive = Layer.unwrap(
  Effect.gen(function* () {
    const enabled = yield* Config.withDefault(
      Config.Boolean('OTEL_ENABLED'),
      false
    )

    if (!enabled) {
      return Layer.empty
    }

    const endpoint = yield* Config.withDefault(
      Config.String('OTEL_EXPORTER_OTLP_ENDPOINT'),
      'http://localhost:4318'
    )
    const serviceName = yield* Config.withDefault(
      Config.String('OTEL_SERVICE_NAME'),
      'lily-api'
    )
    const headersRaw = yield* Config.withDefault(
      Config.String('OTEL_EXPORTER_OTLP_HEADERS'),
      ''
    )
    const headers = parseHeaders(headersRaw)

    yield* Effect.log(
      `OpenTelemetry tracing enabled → ${endpoint} (${serviceName})`
    )

    return OtlpTracer.layer({
      url: `${endpoint}/v1/traces`,
      resource: { serviceName },
      headers,
    }).pipe(
      Layer.provide(OtlpSerialization.layerJson),
      Layer.provide(FetchHttpClient.layer)
    )
  })
)
