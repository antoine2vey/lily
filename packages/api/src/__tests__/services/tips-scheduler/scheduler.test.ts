import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockDailyTipRepository } from '@lily/api/__tests__/mocks/daily-tip.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import type { DailyTip } from '@lily/api/repositories/daily-tip.repository'
import { checkAndGenerateTip } from '@lily/api/services/tips-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { ConfigProvider, Effect, Layer } from 'effect'
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

  it('skips when tip already exists for today', async () => {
    const layer = Layer.mergeAll(
      baseDeps,
      createMockDailyTipRepository([todayTip]),
      enabledConfig
    )

    // Should return early because findByDate(today) returns a tip
    await Effect.runPromise(checkAndGenerateTip.pipe(Effect.provide(layer)))
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
})
