import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { retireStartTokenForDevice } from '@lily/api/services/live-activity/retire-start-token'
import type { ActivityPushToken } from '@lily/shared'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const startToken = (deviceTokenId: string): ActivityPushToken => ({
  id: crypto.randomUUID(),
  userId: 'user-1',
  deviceTokenId,
  kind: 'start',
  activityId: null,
  token: 'apns-start-token',
  status: 'active',
  startedAt: new Date(),
  endsAt: null,
  lastConfirmedAt: null,
  lastFailedAt: null,
  updatedAt: new Date(),
})

describe('retireStartTokenForDevice', () => {
  it('ends the active start-token row for the device', async () => {
    const deviceTokenId = 'device-1'
    const repoLayer = createMockActivityPushTokenRepository({
      tokens: [startToken(deviceTokenId)],
    })

    const remainingActive = await Effect.runPromise(
      Effect.gen(function* () {
        yield* retireStartTokenForDevice(deviceTokenId)
        const repo = yield* ActivityPushTokenRepository
        return yield* repo.findStartTokensByUserId('user-1')
      }).pipe(Effect.provide(repoLayer))
    )

    // The start row is now `ended`, so it no longer appears among active rows.
    expect(remainingActive).toHaveLength(0)
  })

  it('requires only ActivityPushTokenRepository — never the device-token repo', async () => {
    // Regression guard for the cascade bug: retiring a dead LA start token must
    // NOT deactivate the shared Expo `device_token` (which drives regular
    // pushes). The explicit context type below is `ActivityPushTokenRepository`
    // ONLY — if anyone re-introduces a DeviceTokenRepository write into
    // retireStartTokenForDevice, this assignment stops type-checking and CI's
    // `bun run tsc` gate fails.
    const program: Effect.Effect<void, unknown, ActivityPushTokenRepository> =
      retireStartTokenForDevice('device-1')

    await Effect.runPromise(
      program.pipe(
        Effect.provide(createMockActivityPushTokenRepository({ tokens: [] }))
      )
    )

    expect(true).toBe(true)
  })
})
