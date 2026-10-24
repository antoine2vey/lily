import { Effect } from 'effect'
import { HttpMiddleware, HttpServerResponse } from 'effect/http'

export const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const

export const SecurityHeadersMiddleware = HttpMiddleware.make((app) =>
  Effect.map(app, HttpServerResponse.setHeaders(SECURITY_HEADERS))
)
