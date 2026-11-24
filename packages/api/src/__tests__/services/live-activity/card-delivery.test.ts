import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockDeviceTokens } from '@lily/api/__tests__/fixtures/device-tokens'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDeadLetterRepository } from '@lily/api/__tests__/mocks/dead-letter.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import {
  createMockPushService,
  type MockPushServiceOptions,
} from '@lily/api/__tests__/mocks/push.service'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { reconcileActiveActivities } from '@lily/api/services/activity-scheduler/scheduler'
import { triggerLiveActivityStart } from '@lily/api/services/admin/endpoints/trigger-live-activity-start'
import { processEvent } from '@lily/api/services/live-activity/subscriber'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import type { ActivityPushToken } from '@lily/shared'
import {
  type LiveActivityPushMessage,
  PushSendError,
  PushTokenInvalidatedError,
} from '@lily/shared/server'
import { Array, Effect, Layer, Match, Option, References } from 'effect'
import { describe, expect, it } from 'vitest'

// The four callers that push a Live Activity card, run over the same worlds:
// the care push worker, the EventBus subscriber, the 5-minute sweep and the
// admin trigger. Each run records every push and the rows left active.

type Path = 'worker' | 'subscriber' | 'sweep' | 'admin'
const PATHS: ReadonlyArray<Path> = ['worker', 'subscriber', 'sweep', 'admin']

interface World {
  readonly plants: ReadonlyArray<ReturnType<typeof createTestPlant>>
  readonly schedules: ReadonlyArray<ReturnType<typeof createTestSchedule>>
  readonly tokens: ReadonlyArray<ActivityPushToken>
  readonly fail?: MockPushServiceOptions['failLiveActivity']
  readonly eventPlantId?: string
  // user-2 owns plant-1 and has delegated it to user-1.
  readonly delegated?: boolean
}

const DUE = new Date(Date.now() - 60_000)
// Not due today, so the backlog is empty, yet near enough that the worker
// still delivers its reminder.
const TOMORROW = new Date(Date.now() + 86_400_000)

const row = (
  kind: ActivityPushToken['kind'],
  device: 1 | 2
): ActivityPushToken => ({
  id: `apt-${kind}-${device}`,
  userId: 'user-1',
  deviceTokenId: `token-${device}`,
  kind,
  activityId: kind === 'update' ? `activity-${device}` : null,
  token: `${kind}-token-${device}`,
  status: 'active',
  startedAt: new Date(),
  endsAt: null,
  lastConfirmedAt: null,
  lastFailedAt: null,
  lastStartSentAt: null,
  updatedAt: new Date(),
})

// A running card on device 1, and a push-to-start token on both devices.
const CARD_AND_STARTS = [row('update', 1), row('start', 1), row('start', 2)]

const living = (id: string) => createTestPlant({ id, userId: 'user-1' })

const ownerToUser1: DelegationRow = {
  id: 'delegation-1',
  ownerId: 'user-2',
  caretakerId: 'user-1',
  status: 'active',
  message: null,
  startDate: new Date(Date.now() - 86_400_000),
  endDate: new Date(Date.now() + 86_400_000),
  respondedAt: null,
  canceledAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const describePush = (m: LiveActivityPushMessage): string =>
  Match.value(m).pipe(
    Match.tag(
      'LiveActivityStart',
      (s) =>
        `start ${s.to} "${s.contentState.headline}" alert "${s.alert.body}"`
    ),
    Match.tag(
      'LiveActivityUpdate',
      (u) => `update ${u.to} "${u.contentState.headline}"`
    ),
    Match.tag('LiveActivityEnd', (e) => `end ${e.to} ${e.dismissalPolicy}`),
    Match.exhaustive
  )

const runPath = (path: Path, world: World) =>
  Match.value(path).pipe(
    Match.when('worker', () =>
      Effect.asVoid(
        processMessage({
          id: 'msg-1',
          topic: 'watering_reminder',
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1'],
            plantIds: ['plant-1'],
          },
          retryCount: 0,
          createdAt: new Date(),
          scheduledAt: new Date(),
        })
      )
    ),
    Match.when('subscriber', () =>
      processEvent({
        _tag: 'PlantLifecycleChanged',
        userId: 'user-1',
        plantId: world.eventPlantId ?? 'plant-1',
      })
    ),
    Match.when('sweep', () => reconcileActiveActivities),
    Match.when('admin', () =>
      Effect.map(triggerLiveActivityStart('user-1'), (r) => ({
        contentStateBuilt: r.contentStateBuilt,
        startTokenCount: r.startTokenCount,
        outcomes: Array.map(
          r.outcomes,
          (o) => `${o.push} ${o.deviceTokenId} ${o.kind}`
        ),
      }))
    ),
    Match.exhaustive
  )

const observe = async (
  path: Path,
  world: World,
  before: ReadonlyArray<Path> = []
) => {
  const sent: LiveActivityPushMessage[] = []
  let regularPushes = 0
  const activityRepo = createMockActivityPushTokenRepository({
    tokens: Array.map(world.tokens, (t) => ({ ...t })),
  })
  const result = await Effect.runPromise(
    Effect.forEach(before, (earlier) => runPath(earlier, world)).pipe(
      Effect.andThen(runPath(path, world)),
      Effect.provide(
        Layer.mergeAll(
          MockAlerterLive,
          MockSqlClientLive,
          activityRepo,
          createMockPushService({
            onSendLiveActivity: (m) => sent.push(m),
            onSendBatch: (batch) => {
              regularPushes += batch.length
            },
            ...(world.fail ? { failLiveActivity: world.fail } : {}),
          }),
          createMockDeviceTokenRepository(mockDeviceTokens),
          notificationMocks([
            createTestNotification({
              id: 'notification-1',
              userId: 'user-1',
              plantId: 'plant-1',
              status: 'queued',
            }),
          ]).notices,
          createMockDeadLetterRepository(),
          createMockCareScheduleRepository({
            plants: [...world.plants],
            schedules: [...world.schedules],
          }),
          createMockPlantRepository({ plants: [...world.plants] }),
          createMockCareLogRepository([]),
          world.delegated
            ? createMockDelegationRepository({
                delegations: [ownerToUser1],
                delegationPlants: [
                  { delegationId: ownerToUser1.id, plantId: 'plant-1' },
                ],
              })
            : createMockDelegationRepository(),
          createMockCanopyRepository(),
          createMockUserRepository([
            createTestUser({ id: 'user-1', timezone: 'UTC' }),
            createTestUser({ id: 'user-2', timezone: 'UTC' }),
          ])
        )
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )
  const active = await Effect.runPromise(
    Effect.flatMap(ActivityPushTokenRepository, (repo) =>
      Effect.all([
        repo.findActiveActivitiesByUserId('user-1'),
        repo.findStartTokensByUserId('user-1'),
      ])
    ).pipe(Effect.provide(activityRepo))
  )
  return {
    ...(path === 'worker' ? { regularPushes } : {}),
    pushes: Array.map(sent, describePush).sort(),
    active: Array.map(Array.flatten(active), (t) => t.token).sort(),
    ...(result ? { admin: result } : {}),
  }
}

const observeAll = async (world: World) => {
  const entries = await Promise.all(
    Array.map(
      PATHS,
      async (path) => [path, await observe(path, world)] as const
    )
  )
  return Object.fromEntries(entries)
}

const sendError = () => Option.some(new PushSendError({ message: 'APNs 500' }))
const gone = () =>
  Option.some(
    new PushTokenInvalidatedError({ message: 'gone', reason: 'Unregistered' })
  )

describe('Live Activity card delivery, every caller', () => {
  it('an admin trigger, then the care push', async () => {
    expect(
      await observe(
        'worker',
        {
          plants: [living('plant-1')],
          schedules: [
            createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
          ],
          tokens: [row('start', 1), row('start', 2)],
        },
        ['admin']
      )
    ).toMatchInlineSnapshot(`
      {
        "active": [
          "start-token-1",
          "start-token-2",
        ],
        "pushes": [
          "start start-token-1 "1 plant needs care today" alert "1 plant needs care today"",
          "start start-token-2 "1 plant needs care today" alert "1 plant needs care today"",
        ],
        "regularPushes": 2,
      }
    `)
  })

  it('empty backlog', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: TOMORROW }),
        ],
        tokens: CARD_AND_STARTS,
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "admin": {
            "contentStateBuilt": false,
            "outcomes": [
              "end token-1 accepted",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('one task', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
        ],
        tokens: CARD_AND_STARTS,
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "admin": {
            "contentStateBuilt": true,
            "outcomes": [
              "update token-1 accepted",
              "start token-2 accepted",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "start start-token-2 "1 plant needs care today" alert "1 plant needs care today"",
            "update update-token-1 "1 plant needs care today"",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [
            "update update-token-1 "1 plant needs care today"",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [
            "start start-token-2 "1 plant needs care today" alert "Time to give your Test Plant a drink today."",
            "update update-token-1 "1 plant needs care today"",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('several tasks', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1'), living('plant-3')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
          createTestSchedule({
            plantId: 'plant-1',
            careType: 'fertilization',
            nextCareAt: DUE,
          }),
          createTestSchedule({ plantId: 'plant-3', nextCareAt: DUE }),
        ],
        tokens: CARD_AND_STARTS,
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "admin": {
            "contentStateBuilt": true,
            "outcomes": [
              "update token-1 accepted",
              "start token-2 accepted",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "start start-token-2 "2 plants need care today" alert "2 plants need care today"",
            "update update-token-1 "2 plants need care today"",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [
            "update update-token-1 "2 plants need care today"",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [
            "start start-token-2 "2 plants need care today" alert "Time to give your Test Plant a drink today."",
            "update update-token-1 "2 plants need care today"",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('no token at all', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
        ],
        tokens: [],
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [],
          "admin": {
            "contentStateBuilt": true,
            "outcomes": [],
            "startTokenCount": 0,
          },
          "pushes": [],
        },
        "subscriber": {
          "active": [],
          "pushes": [],
        },
        "sweep": {
          "active": [],
          "pushes": [],
        },
        "worker": {
          "active": [],
          "pushes": [],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('start tokens and no running card', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
        ],
        tokens: [row('start', 1), row('start', 2)],
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "admin": {
            "contentStateBuilt": true,
            "outcomes": [
              "start token-1 accepted",
              "start token-2 accepted",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "start start-token-1 "1 plant needs care today" alert "1 plant needs care today"",
            "start start-token-2 "1 plant needs care today" alert "1 plant needs care today"",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "start start-token-1 "1 plant needs care today" alert "Time to give your Test Plant a drink today."",
            "start start-token-2 "1 plant needs care today" alert "Time to give your Test Plant a drink today."",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('every push fails', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
        ],
        tokens: CARD_AND_STARTS,
        fail: sendError,
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "admin": {
            "contentStateBuilt": true,
            "outcomes": [
              "update token-1 send-error",
              "start token-2 send-error",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "start start-token-2 "1 plant needs care today" alert "1 plant needs care today"",
            "update update-token-1 "1 plant needs care today"",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [
            "update update-token-1 "1 plant needs care today"",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [
            "start start-token-2 "1 plant needs care today" alert "Time to give your Test Plant a drink today."",
            "update update-token-1 "1 plant needs care today"",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('every token is invalidated', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
        ],
        tokens: CARD_AND_STARTS,
        fail: gone,
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [],
          "admin": {
            "contentStateBuilt": true,
            "outcomes": [
              "update token-1 token-invalidated",
              "start token-1 token-invalidated",
              "start token-2 token-invalidated",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "start start-token-1 "1 plant needs care today" alert "1 plant needs care today"",
            "start start-token-2 "1 plant needs care today" alert "1 plant needs care today"",
            "update update-token-1 "1 plant needs care today"",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "update update-token-1 "1 plant needs care today"",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
            "update-token-1",
          ],
          "pushes": [],
        },
        "worker": {
          "active": [],
          "pushes": [
            "start start-token-1 "1 plant needs care today" alert "Time to give your Test Plant a drink today."",
            "start start-token-2 "1 plant needs care today" alert "Time to give your Test Plant a drink today."",
            "update update-token-1 "1 plant needs care today"",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  // A caretaker's backlog holds only their own plants, as their care tasks
  // do, so a reminder about a delegated plant finds it empty. The owner's
  // card is never touched.
  it('a caretaker reminded about a delegated plant, nothing of their own due', async () => {
    expect(
      await observeAll({
        plants: [createTestPlant({ id: 'plant-1', userId: 'user-2' })],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: DUE }),
        ],
        tokens: [
          ...CARD_AND_STARTS,
          {
            ...row('update', 2),
            id: 'apt-owner',
            userId: 'user-2',
            token: 'owner-update',
          },
        ],
        delegated: true,
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "admin": {
            "contentStateBuilt": false,
            "outcomes": [
              "end token-1 accepted",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
            "update owner-update "1 plant needs care today"",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('empty backlog after the only due plant died', async () => {
    expect(
      await observeAll({
        plants: [
          living('plant-1'),
          createTestPlant({
            id: 'plant-2',
            userId: 'user-1',
            diedAt: new Date(),
          }),
        ],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: TOMORROW }),
          createTestSchedule({ plantId: 'plant-2', nextCareAt: DUE }),
        ],
        tokens: CARD_AND_STARTS,
        eventPlantId: 'plant-2',
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "admin": {
            "contentStateBuilt": false,
            "outcomes": [
              "end token-1 accepted",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })

  it('empty backlog while every token is invalidated', async () => {
    expect(
      await observeAll({
        plants: [living('plant-1')],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: TOMORROW }),
        ],
        tokens: CARD_AND_STARTS,
        fail: gone,
      })
    ).toMatchInlineSnapshot(`
      {
        "admin": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "admin": {
            "contentStateBuilt": false,
            "outcomes": [
              "end token-1 token-invalidated",
            ],
            "startTokenCount": 2,
          },
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "subscriber": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "sweep": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
        },
        "worker": {
          "active": [
            "start-token-1",
            "start-token-2",
          ],
          "pushes": [
            "end update-token-1 immediate",
          ],
          "regularPushes": 2,
        },
      }
    `)
  })
})
