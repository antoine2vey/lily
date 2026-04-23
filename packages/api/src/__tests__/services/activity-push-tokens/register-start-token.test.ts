import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { registerStartToken } from '@lily/api/services/activity-push-tokens/endpoints/register-start-token'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('registerStartToken', () => {
  const testLayer = (userId = 'user-1') =>
    Layer.mergeAll(
      createMockActivityPushTokenRepository(),
      createMockCurrentUser({ id: userId })
    )

  it('stores a push-to-start token for the current user', async () => {
    const result = await Effect.runPromise(
      registerStartToken({
        startToken: 'abcd1234',
        deviceTokenId: '00000000-0000-0000-0000-000000000001',
      }).pipe(Effect.provide(testLayer()))
    )

    expect(result.kind).toBe('start')
    expect(result.token).toBe('abcd1234')
    expect(result.status).toBe('active')
    expect(result.userId).toBe('user-1')
  })
})
