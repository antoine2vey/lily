import { createTestDeviceToken } from '@lily/api/__tests__/fixtures/device-tokens'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { registerActivityToken } from '@lily/api/services/activity-push-tokens/endpoints/register-activity-token'
import { type ActivityPushToken, DeviceTokenNotFoundError } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('registerActivityToken', () => {
  const ownDevice = createMockDeviceTokenRepository([
    createTestDeviceToken({ id: 'device-A', userId: 'user-1' }),
  ])

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
      lastStartSentAt: null,
      updatedAt: new Date('2026-04-20'),
    }
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository({ tokens: [startToken] }),
      ownDevice,
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
      lastStartSentAt: null,
      updatedAt: new Date('2026-04-20'),
    }
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository({ tokens: [otherDeviceStart] }),
      ownDevice,
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

  it("rejects another user's device token and writes nothing", async () => {
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository(),
      createMockDeviceTokenRepository([
        createTestDeviceToken({ id: 'device-of-user-2', userId: 'user-2' }),
      ]),
      createMockCurrentUser({ id: 'user-1' })
    )

    const exit = await Effect.runPromiseExit(
      registerActivityToken({
        activityId: 'activity-xyz',
        updateToken: 'hijack',
        deviceTokenId: 'device-of-user-2',
      }).pipe(Effect.provide(layer))
    )

    expect(failureOf(exit)).toBeInstanceOf(DeviceTokenNotFoundError)
    const written = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.findByActivityId('activity-xyz')
      ).pipe(Effect.provide(layer))
    )
    expect(written).toBeNull()
  })
})
