import { HttpMiddleware, HttpServerRequest } from '@effect/platform'
import { Effect } from 'effect'

export const LoggingMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const start = Date.now()

    const response = yield* app

    const duration = Date.now() - start
    console.log(
      `${request.method} ${request.url} ${response.status} ${duration}ms`
    )

    return response
  })
)
