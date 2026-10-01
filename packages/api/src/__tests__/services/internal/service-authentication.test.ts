import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { InternalApi } from '@lily/api/services/internal/api'
import {
  ServiceAuth,
  ServiceAuthentication,
} from '@lily/api/services/internal/middleware'
import { ServiceAuthenticationLive } from '@lily/api/services/internal/middleware.impl'
import { UnauthorizedError } from '@lily/shared'
import { ConfigProvider, Effect, Layer, Redacted } from 'effect'
import { HttpServerResponse } from 'effect/http'
import type { HttpApiGroup } from 'effect/http-api'
import { describe, expect, it } from 'vitest'

describe('ServiceAuthenticationLive', () => {
  const testSecret = 'test-service-secret-12345'

  const configLayer = ConfigProvider.layer(
    ConfigProvider.fromUnknown({ SERVICE_TOKEN_SECRET: testSecret })
  )

  const testLayer = Layer.provide(ServiceAuthenticationLive, configLayer)

  // 204 only when the middleware provided a verified ServiceAuth.
  const handler = ServiceAuth.useSync((auth) =>
    HttpServerResponse.empty({ status: auth.verified ? 204 : 500 })
  )

  // The middleware reads neither the request nor the route, so the request
  // services its signature requires are left out of the context.
  const authenticate = (secret: string) =>
    Effect.gen(function* () {
      const auth = yield* ServiceAuthentication
      return yield* auth.apiKey(handler, {
        credential: Redacted.make(secret),
        endpoint: InternalApi.endpoints.issueServiceToken,
        group: InternalApi as unknown as HttpApiGroup.Top,
      })
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      unknown
    >

  it('should verify a valid service secret', async () => {
    const response = await Effect.runPromise(authenticate(testSecret))

    expect(response.status).toBe(204)
  })

  it('should reject an invalid service secret', async () => {
    const exit = await Effect.runPromiseExit(authenticate('wrong-secret'))

    expect(failureOf(exit)).toBeInstanceOf(UnauthorizedError)
  })

  it('should reject a secret with wrong length', async () => {
    const exit = await Effect.runPromiseExit(authenticate('short'))

    expect(failureOf(exit)).toBeInstanceOf(UnauthorizedError)
  })
})
