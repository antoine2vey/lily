import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockDailyTipRepository } from '@lily/api/__tests__/mocks/daily-tip.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import {
  type DailyTip,
  DailyTipRepository,
} from '@lily/api/repositories/daily-tip.repository'
import { EngagementRepository } from '@lily/api/repositories/engagement.repository'
import {
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { checkAndGenerateTip } from '@lily/api/services/tips-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { defectOf } from '@lily/shared/testing'
import { Array, ConfigProvider, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@lily/api/services/tips-scheduler/generator', async () => {
  const { Effect } = await import('effect')
  return {
    generateDailyTip: Effect.succeed({
      title: { en: 'Rotate your pots' },
      body: { en: 'Turn each pot a quarter every week.' },
      category: 'light',
      tags: ['light'],
    }),
  }
})

const disabledConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ TIPS_GENERATION_ENABLED: 'false' })
)

const enabledConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ TIPS_GENERATION_ENABLED: 'true' })
)

const emptyConfig = ConfigProvider.layer(ConfigProvider.fromUnknown({}))

const todayTip: DailyTip = {
  id: 'tip-today',
  title: { en: 'Today tip', fr: 'Conseil du jour' },
  body: { en: 'Body', fr: 'Corps' },
  category: 'watering',
  tags: ['watering'],
  publishDate: new Date().toISOString().slice(0, 10),
  createdAt: new Date(),
}

const notifications: Notification[] = []

const baseDeps = Layer.mergeAll(
  createMockNotificationRepository(notifications),
  createMockEngagementRepository(),
  createMockRagService()
)

describe('checkAndGenerateTip', () => {
  it('skips when TIPS_GENERATION_ENABLED is false', async () => {
    const layer = Layer.mergeAll(
      baseDeps,
      createMockDailyTipRepository([]),
      disabledConfig
    )

    // Should complete without error (early return)
    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))
  })

  it('skips when TIPS_GENERATION_ENABLED is not set (defaults to false)', async () => {
    const layer = Layer.mergeAll(
      baseDeps,
      createMockDailyTipRepository([]),
      emptyConfig
    )

    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))
  })

  it('offers the tip already published today instead of generating another', async () => {
    const recorded: Notification[] = []
    const layer = Layer.mergeAll(
      createMockNotificationRepository(recorded),
      createMockEngagementRepository({
        usersWithTips: [makeUserWithSettings({ id: 'user-1' })],
      }),
      createMockRagService(),
      createMockDailyTipRepository([todayTip]),
      enabledConfig
    )

    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))

    expect(recorded).toMatchObject([
      { userId: 'user-1', params: { tipTitle: 'Today tip', tipBody: 'Body' } },
    ])
  })

  it('skips with explicit false even when no tip exists', async () => {
    const layer = Layer.mergeAll(
      baseDeps,
      createMockDailyTipRepository([]),
      disabledConfig
    )

    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))
  })

  it('does not create notifications when feature flag is off', async () => {
    notifications.length = 0
    const layer = Layer.mergeAll(
      baseDeps,
      createMockDailyTipRepository([]),
      disabledConfig
    )

    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))

    expect(notifications).toHaveLength(0)
  })

  it('records one pending daily_tip carrying the generated tip', async () => {
    const recorded: Notification[] = []
    const layer = Layer.mergeAll(
      createMockNotificationRepository(recorded),
      createMockEngagementRepository({
        usersWithTips: [makeUserWithSettings({ id: 'user-1' })],
      }),
      createMockRagService(),
      createMockDailyTipRepository([]),
      enabledConfig
    )

    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))

    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      userId: 'user-1',
      type: 'daily_tip',
      status: 'pending',
      metadata: {},
      params: {
        tipTitle: 'Rotate your pots',
        tipBody: 'Turn each pot a quarter every week.',
      },
    })
  })

  it.each([
    'watering_reminder',
    'fertilization_reminder',
    'misting_reminder',
    'repotting_reminder',
    'overdue_reminder',
  ] as const)('offers no tip to a user who got a %s today', async (type) => {
    const recorded: Notification[] = [
      createTestNotification({ userId: 'user-1', type }),
    ]
    const layer = Layer.mergeAll(
      createMockNotificationRepository(recorded),
      createMockEngagementRepository({
        usersWithTips: [makeUserWithSettings({ id: 'user-1' })],
        notifications: recorded,
      }),
      createMockRagService(),
      createMockDailyTipRepository([]),
      enabledConfig
    )

    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))

    expect(Array.map(recorded, (n) => n.type)).toEqual([type])
  })

  it('reads the same number of times for forty users as for two', async () => {
    const callsFor = async (userCount: number) => {
      const recorded: Notification[] = []
      const calls: string[] = []
      const counted = <S extends object>(service: S): S =>
        new Proxy(service, {
          get: (target, method, receiver) => {
            const member = Reflect.get(target, method, receiver)
            if (typeof member !== 'function') {
              calls.push(String(method))
              return member
            }
            return (...args: ReadonlyArray<unknown>) => {
              calls.push(String(method))
              return Reflect.apply(member, target, args)
            }
          },
        })
      const mocks = Layer.mergeAll(
        createMockNotificationRepository(recorded),
        createMockEngagementRepository({
          usersWithTips: Array.makeBy(userCount, (n) =>
            makeUserWithSettings({ id: `user-${n}` })
          ),
          notifications: recorded,
        }),
        createMockDailyTipRepository([])
      )
      const countedRepositories = Layer.mergeAll(
        Layer.effect(
          NotificationRepository,
          Effect.gen(function* () {
            return counted(yield* NotificationRepository)
          })
        ),
        Layer.effect(
          EngagementRepository,
          Effect.gen(function* () {
            return counted(yield* EngagementRepository)
          })
        ),
        Layer.effect(
          DailyTipRepository,
          Effect.gen(function* () {
            return counted(yield* DailyTipRepository)
          })
        )
      ).pipe(Layer.provide(mocks))

      await Effect.runPromise(
        checkAndGenerateTip.pipe(
          Effect.provide(
            Layer.mergeAll(
              countedRepositories,
              createMockRagService(),
              enabledConfig
            )
          )
        )
      )

      return {
        reads: Array.filter(calls, (method) => method !== 'create'),
        tipsRecorded: recorded.length,
      }
    }

    const two = await callsFor(2)
    const forty = await callsFor(40)

    expect(forty.reads).toEqual(two.reads)
    expect(two.reads).toEqual([
      'findByDate',
      'getUsersWithTipsEnabled',
      'getTipFatigueNotifications',
    ])
    expect([two.tipsRecorded, forty.tipsRecorded]).toEqual([2, 40])
  })

  it('reaches on the next run the users a run that died left without the tip', async () => {
    const recorded: Notification[] = []
    const users = Array.map(['user-1', 'user-2', 'user-3', 'user-4'], (id) =>
      makeUserWithSettings({ id })
    )
    const tips = createMockDailyTipRepository([])
    const repositories = Layer.mergeAll(
      createMockNotificationRepository(recorded),
      createMockEngagementRepository({
        usersWithTips: users,
        notifications: recorded,
      }),
      createMockRagService(),
      tips,
      enabledConfig
    )
    const dyingAfter = (survivors: number) =>
      Layer.effect(
        NotificationRepository,
        Effect.gen(function* () {
          const repo = yield* NotificationRepository
          const dying: INotificationRepository = {
            ...repo,
            create: (data) =>
              recorded.length < survivors
                ? repo.create(data)
                : Effect.die('process killed'),
          }
          return dying
        })
      ).pipe(Layer.provide(repositories))

    const firstRun = await Effect.runPromiseExit(
      checkAndGenerateTip.pipe(
        Effect.provide(Layer.merge(repositories, dyingAfter(1)))
      )
    )
    expect(defectOf(firstRun)).toBe('process killed')
    expect(Array.map(recorded, (n) => n.userId)).toHaveLength(1)

    await Effect.runPromise(
      checkAndGenerateTip.pipe(Effect.provide(repositories))
    )

    expect(Array.map(recorded, (n) => n.userId).sort()).toEqual([
      'user-1',
      'user-2',
      'user-3',
      'user-4',
    ])
    const published = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DailyTipRepository
        return yield* repo.findRecent(10)
      }).pipe(Effect.provide(tips))
    )
    expect(published).toHaveLength(1)
  })
})
