import {
  SECURITY_HEADERS,
  SecurityHeadersMiddleware,
} from '@lily/api/middleware/security-headers'
import { Effect } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'
import { describe, expect, it } from 'vitest'

describe('SecurityHeadersMiddleware', () => {
  it.each([200, 401, 500])(
    'sets the headers on a %i response',
    async (status) => {
      const response = await Effect.runPromise(
        SecurityHeadersMiddleware(
          Effect.succeed(HttpServerResponse.empty({ status }))
        ).pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(new Request('http://test.local/health'))
          )
        )
      )

      expect(response.headers).toMatchObject({
        'strict-transport-security':
          SECURITY_HEADERS['Strict-Transport-Security'],
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      })
    }
  )
})
