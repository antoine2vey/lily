import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { processEvent } from '@lily/api/services/live-activity/subscriber'
import type { ActivityPushToken } from '@lily/shared'
import type { LiveActivityPushMessage } from '@lily/shared/server'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import { describe, expect, it } from 'vitest'

const updateToken = (): ActivityPushToken => ({
  id: 'apt-1',
  userId: 'user-1',
  deviceTokenId: 'token-1',
  kind: 'update',
  activityId: 'activity-1',
  token: 'update-token-1',
  status: 'active',
  startedAt: new Date(),
  endsAt: null,
  lastConfirmedAt: null,
  lastFailedAt: null,
  lastStartSentAt: null,
  updatedAt: new Date(),
})

const run = (
  plants: ReturnType<typeof createTestPlant>[],
  schedules: ReturnType<typeof createTestSchedule>[],
  tokens: ActivityPushToken[]
) => {
  const sent: LiveActivityPushMessage[] = []
  return Effect.runPromise(
    processEvent({
      _tag: 'PlantLifecycleChanged',
      userId: 'user-1',
      plantId: 'plant-1',
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockActivityPushTokenRepository({ tokens }),
          createMockPushService({ onSendLiveActivity: (m) => sent.push(m) }),
          createMockCareScheduleRepository({ plants, schedules }),
          createMockCareLogRepository([]),
          createMockUserRepository([
            createTestUser({ id: 'user-1', timezone: 'UTC' }),
          ])
        )
      ),
      Logger.withMinimumLogLevel(LogLevel.None)
    )
  ).then(() => sent)
}

describe('live-activity subscriber: PlantLifecycleChanged', () => {
  it('ends the card when the buried plant was the only one due', async () => {
    const plant = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date(),
    })
    const sent = await run(
      [plant],
      [
        createTestSchedule({
          plantId: 'plant-1',
          careType: 'watering',
          nextCareAt: new Date(Date.now() - 60_000),
        }),
      ],
      [updateToken()]
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]?._tag).toBe('LiveActivityEnd')
  })

  it('updates the card when other plants are still due', async () => {
    const dead = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date(),
    })
    const alive = createTestPlant({ id: 'plant-2', userId: 'user-1' })
    const sent = await run(
      [dead, alive],
      [
        createTestSchedule({
          plantId: 'plant-1',
          careType: 'watering',
          nextCareAt: new Date(Date.now() - 60_000),
        }),
        createTestSchedule({
          plantId: 'plant-2',
          careType: 'watering',
          nextCareAt: new Date(Date.now() - 60_000),
        }),
      ],
      [updateToken()]
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]?._tag).toBe('LiveActivityUpdate')
  })

  it('does nothing without an active activity', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const sent = await run([plant], [], [])
    expect(sent).toHaveLength(0)
  })
})
