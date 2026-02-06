import { NodeSdk } from '@effect/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { Config, Effect, Layer } from 'effect'

/**
 * OpenTelemetry tracing layer (traces only, for Jaeger).
 * Enabled via OTEL_ENABLED=true env var.
 */
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

    yield* Effect.log(
      `OpenTelemetry tracing enabled → ${endpoint} (${serviceName})`
    )

    return NodeSdk.layer(() => ({
      resource: { serviceName },
      spanProcessor: new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
      ),
    }))
  })
)
