import * as OtlpLogger from '@effect/opentelemetry/OtlpLogger'
import * as OtlpMetrics from '@effect/opentelemetry/OtlpMetrics'
import * as OtlpTracer from '@effect/opentelemetry/OtlpTracer'
import { FetchHttpClient } from '@effect/platform'
import { Config, Effect, Layer, pipe } from 'effect'

const OtelConfig = Config.all({
  enabled: Config.withDefault(Config.string('OTEL_ENABLED'), 'false'),
  endpoint: Config.withDefault(
    Config.string('OTEL_EXPORTER_OTLP_ENDPOINT'),
    'http://localhost:4318'
  ),
  // Separate Loki endpoint for logs (Loki OTLP lives at /otlp)
  // When not set, logs go to the main endpoint (works with otel-collector/LGTM)
  lokiEndpoint: Config.option(Config.string('OTEL_LOKI_ENDPOINT')),
  headers: Config.withDefault(
    Config.string('OTEL_EXPORTER_OTLP_HEADERS'),
    ''
  ),
  serviceName: Config.withDefault(
    Config.string('OTEL_SERVICE_NAME'),
    'lily-api'
  ),
})

// Parse OTLP headers from comma-separated "key=value" format
const parseHeaders = (headersStr: string): Record<string, string> => {
  if (headersStr.length === 0) return {}
  return pipe(headersStr.split(','), (pairs) =>
    pairs.reduce<Record<string, string>>((acc, pair) => {
      const eqIndex = pair.indexOf('=')
      if (eqIndex > 0) {
        const key = pair.substring(0, eqIndex).trim()
        const value = pair.substring(eqIndex + 1).trim()
        acc[key] = value
      }
      return acc
    }, {})
  )
}

export const TelemetryLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* OtelConfig

    if (config.enabled !== 'true') {
      return Layer.empty
    }

    const headers = parseHeaders(config.headers)
    const resource = { serviceName: config.serviceName }

    // Traces & metrics always go to the main OTLP endpoint
    const tracesUrl = `${config.endpoint}/v1/traces`
    const metricsUrl = `${config.endpoint}/v1/metrics`

    // Logs go to a separate Loki endpoint if configured,
    // otherwise to the main endpoint (for otel-collector/LGTM setups)
    const logsUrl = pipe(
      config.lokiEndpoint,
      (_) =>
        _._tag === 'Some'
          ? `${_.value}/v1/logs`
          : `${config.endpoint}/v1/logs`
    )

    yield* Effect.log('OpenTelemetry enabled', {
      tracesUrl,
      logsUrl,
      metricsUrl,
      serviceName: config.serviceName,
    })

    return Layer.mergeAll(
      OtlpTracer.layer({ url: tracesUrl, resource, headers }),
      OtlpLogger.layer({ url: logsUrl, resource, headers }),
      OtlpMetrics.layer({ url: metricsUrl, resource, headers })
    ).pipe(Layer.provide(FetchHttpClient.layer))
  })
)
