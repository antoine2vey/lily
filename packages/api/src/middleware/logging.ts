import { HttpMiddleware, HttpServerRequest } from '@effect/platform'
import { DateTime, Effect } from 'effect'

export const LoggingMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const start = DateTime.unsafeNow()

    const response = yield* Effect.tapErrorCause(app, (_cause) => {
      const duration = DateTime.distance(start, DateTime.unsafeNow())

      return Effect.gen(function* () {
        yield* Effect.logError('HTTP request failed', {
          method: request.method,
          url: request.url,
          duration_ms: duration,
        })
        yield* Effect.annotateCurrentSpan('http.method', request.method)
        yield* Effect.annotateCurrentSpan('http.url', request.url)
        yield* Effect.annotateCurrentSpan('http.duration_ms', duration)
        yield* Effect.annotateCurrentSpan('error', true)
      })
    })

    const duration = DateTime.distance(start, DateTime.unsafeNow())

    yield* Effect.log('HTTP request completed', {
      method: request.method,
      url: request.url,
      status: response.status,
      duration_ms: duration,
    })
    yield* Effect.annotateCurrentSpan('http.method', request.method)
    yield* Effect.annotateCurrentSpan('http.url', request.url)
    yield* Effect.annotateCurrentSpan('http.status_code', response.status)
    yield* Effect.annotateCurrentSpan('http.duration_ms', duration)

    return response
  }).pipe(Effect.withSpan('http.request'))
)
