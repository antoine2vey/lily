import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { registerStartToken } from '@lily/api/services/activity-push-tokens/endpoints/register-start-token'
import type { ActivityPushToken } from '@lily/shared'
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

  it('marks orphan start-rows on dead device_tokens as ended', async () => {
    const orphan: ActivityPushToken = {
      id: 'orphan-id',
      userId: 'user-1',
      deviceTokenId: 'device-old',
      kind: 'start',
      activityId: null,
      token: 'old-token',
      status: 'active',
      startedAt: new Date('2026-04-01'),
      endsAt: null,
      lastConfirmedAt: null,
      lastFailedAt: null,
      updatedAt: new Date('2026-04-01'),
    }
    const liveOnAnotherDevice: ActivityPushToken = {
      ...orphan,
      id: 'live-id',
      deviceTokenId: 'device-still-alive',
    }
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository({
        tokens: [orphan, liveOnAnotherDevice],
        inactiveDeviceTokenIds: ['device-old'],
      }),
      createMockCurrentUser({ id: 'user-1' })
    )

    await Effect.runPromise(
      registerStartToken({
        startToken: 'fresh',
        deviceTokenId: 'device-new',
      }).pipe(Effect.provide(layer))
    )

    const all = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.findStartTokensByUserId('user-1')
      ).pipe(Effect.provide(layer))
    )
    const ids = all.map((t) => t.id)
    expect(ids).toContain('live-id')
    expect(ids).not.toContain('orphan-id')
  })
})
