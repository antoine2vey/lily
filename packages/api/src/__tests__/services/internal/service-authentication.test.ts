import { ServiceAuthentication } from '@lily/api/services/internal/middleware'
import { ServiceAuthenticationLive } from '@lily/api/services/internal/middleware.impl'
import { ConfigProvider, Effect, Layer, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'

describe('ServiceAuthenticationLive', () => {
  const testSecret = 'test-service-secret-12345'

  const configLayer = Layer.setConfigProvider(
    ConfigProvider.fromMap(new Map([['SERVICE_TOKEN_SECRET', testSecret]]))
  )

  const testLayer = Layer.provide(ServiceAuthenticationLive, configLayer)

  it('should verify a valid service secret', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* ServiceAuthentication
        return yield* auth.apiKey(Redacted.make(testSecret))
      }).pipe(Effect.provide(testLayer))
    )

    expect(result).toEqual({ verified: true })
  })

  it('should reject an invalid service secret', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const auth = yield* ServiceAuthentication
        return yield* auth.apiKey(Redacted.make('wrong-secret'))
      }).pipe(Effect.provide(testLayer))
    )

    expect(exit._tag).toBe('Failure')
  })

  it('should reject a secret with wrong length', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const auth = yield* ServiceAuthentication
        return yield* auth.apiKey(Redacted.make('short'))
      }).pipe(Effect.provide(testLayer))
    )

    expect(exit._tag).toBe('Failure')
  })
})
