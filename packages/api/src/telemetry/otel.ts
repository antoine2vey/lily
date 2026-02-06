import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { Config, Effect, Layer, pipe } from 'effect'

const OtelConfig = Config.all({
  enabled: Config.withDefault(Config.string('OTEL_ENABLED'), 'false'),
  endpoint: Config.withDefault(
    Config.string('OTEL_EXPORTER_OTLP_ENDPOINT'),
    'http://localhost:4318'
  ),
  headers: Config.withDefault(Config.string('OTEL_EXPORTER_OTLP_HEADERS'), ''),
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

    yield* Effect.log('OpenTelemetry enabled', {
      endpoint: config.endpoint,
      serviceName: config.serviceName,
    })

    return Otlp.layer({
      baseUrl: config.endpoint,
      resource: {
        serviceName: config.serviceName,
      },
      headers: parseHeaders(config.headers),
    }).pipe(Layer.provide(FetchHttpClient.layer))
  })
)
