import { API_PREFIX } from '@lily/shared'
import { Array, Effect, Option, pipe, String } from 'effect'
import { HttpMiddleware, HttpServerRequest } from 'effect/http'

const LEGACY_PREFIX = '/api'

const isAtOrUnder =
  (prefix: string) =>
  (path: string): boolean =>
    path === prefix || String.startsWith(`${prefix}/`)(path)

const pathOf = (url: string): string =>
  pipe(url, String.split('?'), Array.headNonEmpty)

export const toVersionedUrl = (url: string): Option.Option<string> => {
  const path = pathOf(url)
  return isAtOrUnder(LEGACY_PREFIX)(path) && !isAtOrUnder(API_PREFIX)(path)
    ? Option.some(`${API_PREFIX}${String.slice(LEGACY_PREFIX.length)(url)}`)
    : Option.none()
}

export const LegacyApiPrefixMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    return yield* Option.match(toVersionedUrl(request.url), {
      onNone: () => app,
      onSome: (url) =>
        Effect.annotateCurrentSpan('http.legacy_api_prefix', true).pipe(
          Effect.andThen(app),
          Effect.updateService(HttpServerRequest.HttpServerRequest, (r) =>
            r.modify({ url })
          )
        ),
    })
  })
)
