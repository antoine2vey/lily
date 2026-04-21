import {
  type HttpApp,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform'
import { ObservabilityMiddleware } from '@lily/api/middleware/observability'
import {
  type AlertEvent,
  Alerter,
  type IAlerter,
} from '@lily/api/services/alerting/service'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import { describe, expect, it } from 'vitest'

const makeCapturingAlerter = () => {
  const events: AlertEvent[] = []
  const alerter: IAlerter = {
    alert: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
    alertWarning: () => Effect.void,
  }
  return { events, layer: Layer.succeed(Alerter, alerter) }
}

const fakeRequest = HttpServerRequest.fromWeb(
  new Request('http://test.local/api/plants', { method: 'POST' })
)

const runWithApp = async (
  status: number,
  alerterLayer: Layer.Layer<Alerter>
): Promise<void> => {
  const response = HttpServerResponse.empty({ status })
  const app: HttpApp.Default = Effect.succeed(response)
  await Effect.runPromise(
    ObservabilityMiddleware(app).pipe(
      Effect.asVoid,
      Effect.provide(HttpServer.layerContext),
      Effect.provideService(HttpServerRequest.HttpServerRequest, fakeRequest),
      Effect.provide(alerterLayer),
      Logger.withMinimumLogLevel(LogLevel.None)
    )
  )
}

describe('ObservabilityMiddleware (5xx alerting)', () => {
  it('fires alert on 5xx responses', async () => {
    const { events, layer } = makeCapturingAlerter()
    await runWithApp(500, layer)
    expect(events).toHaveLength(1)
    expect(events[0]?._tag).toBe('HttpError5xx')
    expect((events[0] as { status: number }).status).toBe(500)
  })

  it('does not fire on 2xx responses', async () => {
    const { events, layer } = makeCapturingAlerter()
    await runWithApp(200, layer)
    expect(events).toHaveLength(0)
  })

  it('does not fire on 4xx responses', async () => {
    const { events, layer } = makeCapturingAlerter()
    await runWithApp(404, layer)
    expect(events).toHaveLength(0)
  })

  it('fires on 503 responses', async () => {
    const { events, layer } = makeCapturingAlerter()
    await runWithApp(503, layer)
    expect(events).toHaveLength(1)
    expect((events[0] as { status: number }).status).toBe(503)
  })
})
