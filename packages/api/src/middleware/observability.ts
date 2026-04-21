import { HttpMiddleware, HttpServerRequest } from '@effect/platform'
import { Alerter } from '@lily/api/services/alerting/service'
import { DateTime, Effect } from 'effect'

/**
 * Combined request logger + 5xx alerter — a single pass through the middleware
 * chain computes one start/end timestamp used by both log emission and the
 * alert payload.
 */
export const ObservabilityMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const start = DateTime.unsafeNow()

    const response = yield* app

    const durationMs = DateTime.distance(start, DateTime.unsafeNow())

    yield* Effect.log(
      `${request.method} ${request.url} ${response.status} (${durationMs}ms)`
    )
    yield* Effect.annotateCurrentSpan('http.method', request.method)
    yield* Effect.annotateCurrentSpan('http.url', request.url)
    yield* Effect.annotateCurrentSpan('http.status_code', response.status)
    yield* Effect.annotateCurrentSpan('http.duration_ms', durationMs)

    if (response.status >= 500) {
      const alerter = yield* Alerter
      yield* alerter.alert({
        _tag: 'HttpError5xx',
        method: request.method,
        url: request.url,
        status: response.status,
        durationMs,
      })
    }

    return response
  }).pipe(Effect.withSpan('http.request'))
)
