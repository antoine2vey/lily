import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import {
  createCanopyStore,
  createMockCanopyRepository,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { processEvent } from '@lily/api/services/live-activity/subscriber'
import type { ActivityPushToken } from '@lily/shared'
import type { AppEvent, LiveActivityPushMessage } from '@lily/shared/server'
import { Effect, Layer, References } from 'effect'
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
          createMockPlantRepository({ plants }),
          createMockDelegationRepository(),
          createMockCanopyRepository(),
          createMockCareLogRepository([]),
          createMockUserRepository([
            createTestUser({ id: 'user-1', timezone: 'UTC' }),
          ])
        )
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
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

describe('live-activity subscriber: CareLogCreated on a Canopy plant', () => {
  const tokenFor = (userId: string): ActivityPushToken => ({
    ...updateToken(),
    id: `apt-${userId}`,
    userId,
    deviceTokenId: `token-${userId}`,
    activityId: `activity-${userId}`,
    token: `update-token-${userId}`,
  })

  const runCare = (
    event: AppEvent,
    mutes: { userId: string; plantId: string }[] = []
  ) => {
    const sent: Array<{ to: string; tag: LiveActivityPushMessage['_tag'] }> = []
    const shared = createTestPlant({
      id: 'plant-1',
      userId: null,
      canopyId: mockCanopyId,
    })
    const other = createTestPlant({
      id: 'plant-2',
      userId: null,
      canopyId: mockCanopyId,
    })
    const members = [
      createTestMembership({ userId: 'alex', role: 'owner' }),
      createTestMembership({ userId: 'lily' }),
      createTestMembership({ userId: 'sam' }),
    ]
    const dueNow = (plantId: string) =>
      createTestSchedule({
        plantId,
        careType: 'watering',
        nextCareAt: new Date(Date.now() - 60_000),
      })
    return Effect.runPromise(
      processEvent(event).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockActivityPushTokenRepository({
              tokens: [tokenFor('alex'), tokenFor('lily'), tokenFor('sam')],
            }),
            createMockPushService({
              onSendLiveActivity: (m) => sent.push({ to: m.to, tag: m._tag }),
            }),
            createMockCareScheduleRepository({
              plants: [shared, other],
              schedules: [dueNow('plant-1'), dueNow('plant-2')],
              memberships: members,
              mutes,
            }),
            createMockPlantRepository({ plants: [shared, other] }),
            createMockDelegationRepository(),
            createMockCanopyRepository(createCanopyStore({ members, mutes })),
            createMockCareLogRepository([]),
            createMockUserRepository([
              createTestUser({ id: 'alex', timezone: 'UTC' }),
              createTestUser({ id: 'lily', timezone: 'UTC' }),
              createTestUser({ id: 'sam', timezone: 'UTC' }),
            ])
          )
        ),
        Effect.provideService(References.MinimumLogLevel, 'None')
      )
    ).then(() => sent)
  }

  const lilyWaters: AppEvent = {
    _tag: 'CareLogCreated',
    userId: 'lily',
    plantId: 'plant-1',
    careLogId: 'log-1',
    type: 'watering',
  }

  it('refreshes every member card, not only the actor', async () => {
    const sent = await runCare(lilyWaters)
    expect(sent.map((m) => m.to).sort()).toEqual([
      'update-token-alex',
      'update-token-lily',
      'update-token-sam',
    ])
    expect(sent.every((m) => m.tag === 'LiveActivityUpdate')).toBe(true)
  })

  it('leaves a member who muted the plant alone, but still refreshes the actor', async () => {
    const sent = await runCare(lilyWaters, [
      { userId: 'sam', plantId: 'plant-1' },
    ])
    expect(sent.map((m) => m.to).sort()).toEqual([
      'update-token-alex',
      'update-token-lily',
    ])
  })

  it('refreshes every member on PlantLifecycleChanged too', async () => {
    const sent = await runCare({
      _tag: 'PlantLifecycleChanged',
      userId: 'alex',
      plantId: 'plant-1',
    })
    expect(sent).toHaveLength(3)
  })
})

describe('live-activity subscriber: CareLogCreated by a caretaker', () => {
  it('refreshes the owner card as well as the caretaker card on a delegated plant', async () => {
    const sent: string[] = []
    const fern = createTestPlant({ id: 'plant-1', userId: 'owner' })
    const tokenFor = (userId: string): ActivityPushToken => ({
      ...updateToken(),
      id: `apt-${userId}`,
      userId,
      deviceTokenId: `token-${userId}`,
      activityId: `activity-${userId}`,
      token: `update-token-${userId}`,
    })
    await Effect.runPromise(
      processEvent({
        _tag: 'CareLogCreated',
        userId: 'caretaker',
        plantId: 'plant-1',
        careLogId: 'log-1',
        type: 'watering',
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockActivityPushTokenRepository({
              tokens: [tokenFor('owner'), tokenFor('caretaker')],
            }),
            createMockPushService({
              onSendLiveActivity: (m) => sent.push(m.to),
            }),
            createMockCareScheduleRepository({
              plants: [fern],
              schedules: [
                createTestSchedule({
                  plantId: 'plant-1',
                  careType: 'fertilization',
                  nextCareAt: new Date(Date.now() - 60_000),
                }),
              ],
            }),
            createMockPlantRepository({ plants: [fern] }),
            createMockDelegationRepository({
              delegations: [
                {
                  id: 'delegation-1',
                  ownerId: 'owner',
                  caretakerId: 'caretaker',
                  status: 'active',
                  message: null,
                  startDate: new Date(Date.now() - 86_400_000),
                  endDate: new Date(Date.now() + 86_400_000),
                  respondedAt: null,
                  canceledAt: null,
                  completedAt: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
              delegationPlants: [
                { delegationId: 'delegation-1', plantId: 'plant-1' },
              ],
            }),
            createMockCanopyRepository(),
            createMockCareLogRepository([]),
            createMockUserRepository([
              createTestUser({ id: 'owner', timezone: 'UTC' }),
              createTestUser({ id: 'caretaker', timezone: 'UTC' }),
            ])
          )
        ),
        Effect.provideService(References.MinimumLogLevel, 'None')
      )
    )
    expect(sent).toContain('update-token-owner')
  })
})
