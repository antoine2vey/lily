import { NodeSdk } from '@effect/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { Layer } from 'effect'

// OTLP exporter - sends to localhost:4318 by default (Jaeger/OTEL Collector)
const traceExporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    'http://localhost:4318/v1/traces',
})

export const OtelLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: 'lily-api',
    serviceVersion: '1.0.0',
  },
  spanProcessor: new BatchSpanProcessor(traceExporter),
}))

// Console-only version for local dev without collector
export const OtelConsoleLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: 'lily-api',
    serviceVersion: '1.0.0',
  },
}))

// Use OTEL_ENABLED env var to toggle
export const TelemetryLive: Layer.Layer<never> =
  process.env.OTEL_ENABLED === 'true' ? OtelLive : Layer.empty
