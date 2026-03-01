import { HttpMiddleware, HttpServerRequest } from '@effect/platform'
import { DateTime, Effect } from 'effect'

export const LoggingMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const start = DateTime.unsafeNow()

    const response = yield* app

    const duration = DateTime.distance(start, DateTime.unsafeNow())

    yield* Effect.log(
      `${request.method} ${request.url} ${response.status} (${duration}ms)`
    )
    yield* Effect.annotateCurrentSpan('http.method', request.method)
    yield* Effect.annotateCurrentSpan('http.url', request.url)
    yield* Effect.annotateCurrentSpan('http.status_code', response.status)
    yield* Effect.annotateCurrentSpan('http.duration_ms', duration)

    return response
  }).pipe(Effect.withSpan('http.request'))
)
