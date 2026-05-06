import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
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
        Array.filterMap(parsePair),
        Record.fromEntries
      )

export const TelemetryLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const enabled = yield* Config.withDefault(
      Config.boolean('OTEL_ENABLED'),
      false
    )

    if (!enabled) {
      return Layer.empty
    }

    const endpoint = yield* Config.withDefault(
      Config.string('OTEL_EXPORTER_OTLP_ENDPOINT'),
      'http://localhost:4318'
    )
    const serviceName = yield* Config.withDefault(
      Config.string('OTEL_SERVICE_NAME'),
      'lily-api'
    )
    const headersRaw = yield* Config.withDefault(
      Config.string('OTEL_EXPORTER_OTLP_HEADERS'),
      ''
    )
    const headers = parseHeaders(headersRaw)

    yield* Effect.log(
      `OpenTelemetry tracing enabled → ${endpoint} (${serviceName})`
    )

    return NodeSdk.layer(() => ({
      resource: { serviceName },
      spanProcessor: new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${endpoint}/v1/traces`,
          ...(Record.isEmptyRecord(headers) ? {} : { headers }),
        })
      ),
    }))
  })
)
