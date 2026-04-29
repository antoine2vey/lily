import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { registerActivityToken } from '@lily/api/services/activity-push-tokens/endpoints/register-activity-token'
import type { ActivityPushToken } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('registerActivityToken', () => {
  it('confirms the matching start-token when an update token is registered', async () => {
    const startToken: ActivityPushToken = {
      id: 'start-id',
      userId: 'user-1',
      deviceTokenId: 'device-A',
      kind: 'start',
      activityId: null,
      token: 'start-token',
      status: 'active',
      startedAt: new Date('2026-04-20'),
      endsAt: null,
      lastConfirmedAt: null,
      lastFailedAt: null,
      updatedAt: new Date('2026-04-20'),
    }
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository({ tokens: [startToken] }),
      createMockCurrentUser({ id: 'user-1' })
    )

    await Effect.runPromise(
      registerActivityToken({
        activityId: 'activity-xyz',
        updateToken: 'update-token',
        deviceTokenId: 'device-A',
      }).pipe(Effect.provide(layer))
    )

    const startsAfter = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.findStartTokensByUserId('user-1')
      ).pipe(Effect.provide(layer))
    )
    expect(startsAfter).toHaveLength(1)
    expect(startsAfter[0]?.lastConfirmedAt).toBeInstanceOf(Date)
  })

  it('does not confirm start-tokens for other devices', async () => {
    const otherDeviceStart: ActivityPushToken = {
      id: 'other-start',
      userId: 'user-1',
      deviceTokenId: 'device-B',
      kind: 'start',
      activityId: null,
      token: 'start-other',
      status: 'active',
      startedAt: new Date('2026-04-20'),
      endsAt: null,
      lastConfirmedAt: null,
      lastFailedAt: null,
      updatedAt: new Date('2026-04-20'),
    }
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository({ tokens: [otherDeviceStart] }),
      createMockCurrentUser({ id: 'user-1' })
    )

    await Effect.runPromise(
      registerActivityToken({
        activityId: 'activity-xyz',
        updateToken: 'update-token',
        deviceTokenId: 'device-A',
      }).pipe(Effect.provide(layer))
    )

    const startsAfter = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.findStartTokensByUserId('user-1')
      ).pipe(Effect.provide(layer))
    )
    expect(startsAfter[0]?.lastConfirmedAt).toBeNull()
  })
})
