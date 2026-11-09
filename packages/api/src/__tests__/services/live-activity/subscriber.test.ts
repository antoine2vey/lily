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
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import {
  createMockPushService,
  type MockPushServiceOptions,
} from '@lily/api/__tests__/mocks/push.service'
import { createMockRecipientRepository } from '@lily/api/__tests__/mocks/recipient.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { processEvent } from '@lily/api/services/live-activity/subscriber'
import type { ActivityPushToken, UserStatus } from '@lily/shared'
import {
  type AppEvent,
  type LiveActivityPushMessage,
  PushSendError,
  PushTokenInvalidatedError,
} from '@lily/shared/server'
import { Array, Effect, Exit, Layer, Option, References } from 'effect'
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

const run = async (
  plants: ReturnType<typeof createTestPlant>[],
  schedules: ReturnType<typeof createTestSchedule>[],
  tokens: ActivityPushToken[],
  failLiveActivity?: MockPushServiceOptions['failLiveActivity']
) => {
  const sent: LiveActivityPushMessage[] = []
  const activityRepo = createMockActivityPushTokenRepository({ tokens })
  const exit = await Effect.runPromiseExit(
    processEvent({
      _tag: 'PlantLifecycleChanged',
      userId: 'user-1',
      plantId: 'plant-1',
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          activityRepo,
          createMockPushService({
            onSendLiveActivity: (m) => sent.push(m),
            ...(failLiveActivity ? { failLiveActivity } : {}),
          }),
          createMockCareScheduleRepository({ plants, schedules }),
          createMockPlantRepository({ plants }),
          createMockRecipientRepository({ plants }),
          createMockCanopyRepository(),
          createMockCareLogRepository([]),
          createMockUserRepository([
            createTestUser({ id: 'user-1', timezone: 'UTC' }),
          ])
        )
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )
  expect(Exit.isSuccess(exit)).toBe(true)
  const stillActive = await Effect.runPromise(
    Effect.flatMap(ActivityPushTokenRepository, (repo) =>
      repo.findActiveActivitiesByUserId('user-1')
    ).pipe(Effect.provide(activityRepo))
  )
  return {
    sent,
    stillActive: Array.map(stillActive, (a) => a.token).sort(),
  }
}

describe('live-activity subscriber: PlantLifecycleChanged', () => {
  it('ends the card when the buried plant was the only one due', async () => {
    const plant = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date(),
    })
    const { sent } = await run(
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
    const { sent } = await run(
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

  const secondDevice = (): ActivityPushToken => ({
    ...updateToken(),
    id: 'apt-2',
    deviceTokenId: 'token-2',
    activityId: 'activity-2',
    token: 'update-token-2',
  })

  it('refreshes the card on every device', async () => {
    const dead = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date(),
    })
    const alive = createTestPlant({ id: 'plant-2', userId: 'user-1' })
    const { sent } = await run(
      [dead, alive],
      [
        createTestSchedule({
          plantId: 'plant-2',
          careType: 'watering',
          nextCareAt: new Date(Date.now() - 60_000),
        }),
      ],
      [updateToken(), secondDevice()]
    )

    expect(sent.map((m) => `${m._tag} ${m.to}`).sort()).toEqual([
      'LiveActivityUpdate update-token-1',
      'LiveActivityUpdate update-token-2',
    ])
  })

  it('ends the card on every device when nothing is left due', async () => {
    const plant = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date(),
    })
    const { sent } = await run([plant], [], [updateToken(), secondDevice()])

    expect(sent.map((m) => `${m._tag} ${m.to}`).sort()).toEqual([
      'LiveActivityEnd update-token-1',
      'LiveActivityEnd update-token-2',
    ])
  })

  const dueNow = (plantId: string) =>
    createTestSchedule({
      plantId,
      careType: 'watering',
      nextCareAt: new Date(Date.now() - 60_000),
    })

  const deadAndAlive = () => [
    createTestPlant({ id: 'plant-1', userId: 'user-1', diedAt: new Date() }),
    createTestPlant({ id: 'plant-2', userId: 'user-1' }),
  ]

  it('still refreshes the second card when APNs fails the first', async () => {
    const { sent } = await run(
      deadAndAlive(),
      [dueNow('plant-2')],
      [updateToken(), secondDevice()],
      (m) =>
        m.to === 'update-token-1'
          ? Option.some(new PushSendError({ message: 'APNs 500' }))
          : Option.none()
    )

    expect(sent.map((m) => `${m._tag} ${m.to}`).sort()).toEqual([
      'LiveActivityUpdate update-token-1',
      'LiveActivityUpdate update-token-2',
    ])
  })

  it('marks every ended card ended so no row stays active', async () => {
    const plant = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date(),
    })
    const { stillActive } = await run(
      [plant],
      [],
      [updateToken(), secondDevice()]
    )

    expect(stillActive).toEqual([])
  })

  it('marks a card ended when its update token is dead, and keeps the other', async () => {
    const { stillActive } = await run(
      deadAndAlive(),
      [dueNow('plant-2')],
      [updateToken(), secondDevice()],
      (m) =>
        m.to === 'update-token-1'
          ? Option.some(
              new PushTokenInvalidatedError({
                message: 'gone',
                reason: 'Unregistered',
              })
            )
          : Option.none()
    )

    expect(stillActive).toEqual(['update-token-2'])
  })

  it('does nothing without an active activity', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const { sent } = await run([plant], [], [])
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
    mutes: { userId: string; plantId: string }[] = [],
    suspended: string[] = []
  ) => {
    const member = (id: string) =>
      createTestUser({
        id,
        timezone: 'UTC',
        status: suspended.includes(id) ? 'suspended' : 'active',
      })
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
    const users = [member('alex'), member('lily'), member('sam')]
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
            createMockRecipientRepository({
              plants: [shared, other],
              members,
              mutes,
              users,
            }),
            createMockCanopyRepository(createCanopyStore({ members, mutes })),
            createMockCareLogRepository([]),
            createMockUserRepository(users)
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

  it('leaves the card of a suspended member alone', async () => {
    const sent = await runCare(lilyWaters, [], ['sam'])
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
  const runCaretakerCare = async (ownerStatus: UserStatus) => {
    const sent: string[] = []
    const fern = createTestPlant({ id: 'plant-1', userId: 'owner' })
    const users = [
      createTestUser({ id: 'owner', timezone: 'UTC', status: ownerStatus }),
      createTestUser({ id: 'caretaker', timezone: 'UTC' }),
    ]
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
            createMockRecipientRepository({
              plants: [fern],
              delegations: [
                {
                  id: 'delegation-1',
                  caretakerId: 'caretaker',
                  status: 'active',
                },
              ],
              delegationPlants: [
                { delegationId: 'delegation-1', plantId: 'plant-1' },
              ],
              users,
            }),
            createMockCanopyRepository(),
            createMockCareLogRepository([]),
            createMockUserRepository(users)
          )
        ),
        Effect.provideService(References.MinimumLogLevel, 'None')
      )
    )
    return sent
  }

  it('refreshes the owner card as well as the caretaker card on a delegated plant', async () => {
    expect(await runCaretakerCare('active')).toContain('update-token-owner')
  })

  it('leaves the card of a suspended owner alone', async () => {
    expect(await runCaretakerCare('suspended')).toEqual([
      'update-token-caretaker',
    ])
  })
})
