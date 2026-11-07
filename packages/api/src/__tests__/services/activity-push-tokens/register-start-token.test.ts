import { createTestDeviceToken } from '@lily/api/__tests__/fixtures/device-tokens'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { registerStartToken } from '@lily/api/services/activity-push-tokens/endpoints/register-start-token'
import { registerDeviceToken } from '@lily/api/services/device-tokens/endpoints/register-device-token'
import { type ActivityPushToken, DeviceTokenNotFoundError } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('registerStartToken', () => {
  const testLayer = (userId = 'user-1') =>
    Layer.mergeAll(
      createMockActivityPushTokenRepository(),
      createMockDeviceTokenRepository([
        createTestDeviceToken({
          id: '00000000-0000-0000-0000-000000000001',
          userId: 'user-1',
        }),
      ]),
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
      lastStartSentAt: null,
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
      createMockDeviceTokenRepository([
        createTestDeviceToken({ id: 'device-new', userId: 'user-1' }),
      ]),
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

  it("rejects another user's device token and writes nothing", async () => {
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository(),
      createMockDeviceTokenRepository([
        createTestDeviceToken({ id: 'device-of-user-2', userId: 'user-2' }),
      ]),
      createMockCurrentUser({ id: 'user-1' })
    )

    const exit = await Effect.runPromiseExit(
      registerStartToken({
        startToken: 'hijack',
        deviceTokenId: 'device-of-user-2',
      }).pipe(Effect.provide(layer))
    )

    expect(failureOf(exit)).toBeInstanceOf(DeviceTokenNotFoundError)
    const written = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.findStartTokensByUserId('user-1')
      ).pipe(Effect.provide(layer))
    )
    expect(written).toEqual([])
  })

  it('accepts a device token reassigned to the user who signed in on it', async () => {
    const layer = Layer.mergeAll(
      createMockActivityPushTokenRepository(),
      createMockDeviceTokenRepository([
        createTestDeviceToken({
          id: 'shared-device',
          token: 'expo-shared',
          userId: 'user-1',
        }),
      ]),
      createMockCurrentUser({ id: 'user-2' })
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const device = yield* registerDeviceToken({
          token: 'expo-shared',
          platform: 'ios',
        })
        return yield* registerStartToken({
          startToken: 'fresh',
          deviceTokenId: device.id,
        })
      }).pipe(Effect.provide(layer))
    )

    expect(result.deviceTokenId).toBe('shared-device')
    expect(result.userId).toBe('user-2')
  })
})
