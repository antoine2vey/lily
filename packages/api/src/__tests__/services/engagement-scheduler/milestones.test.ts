import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type { UserWithSettings } from '@lily/api/repositories/engagement.repository'
import { processPlantParentMilestones } from '@lily/api/services/engagement-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

const makeUser = (
  overrides: Partial<UserWithSettings> & { id: string }
): UserWithSettings => ({
  tips: true,
  personalizedTips: false,
  timezone: 'Europe/Paris',
  doNotDisturb: false,
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  language: 'en',
  createdAt: daysAgo(30),
  ...overrides,
})

describe('processPlantParentMilestones', () => {
  it('creates notification on exact 7-day milestone', async () => {
    const user = makeUser({
      id: 'user-1',
      createdAt: daysAgo(7),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantParentMilestones([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('plant_parent_milestone')
    expect(notifications[0]?.userId).toBe('user-1')
  })

  it('creates notification on exact 30-day milestone', async () => {
    const user = makeUser({
      id: 'user-1',
      createdAt: daysAgo(30),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantParentMilestones([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('plant_parent_milestone')
  })

  it('skips non-milestone day', async () => {
    const user = makeUser({
      id: 'user-1',
      createdAt: daysAgo(8),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantParentMilestones([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('dedup: skips if already sent for this milestone', async () => {
    const user = makeUser({
      id: 'user-1',
      createdAt: daysAgo(90),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        notificationsInPeriod: {
          'user-1:plant_parent_milestone': true,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantParentMilestones([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('handles empty user list without errors', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantParentMilestones([]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('handles multiple users with different milestone eligibility', async () => {
    const milestone7 = makeUser({
      id: 'user-7day',
      createdAt: daysAgo(7),
    })
    const milestone365 = makeUser({
      id: 'user-365day',
      createdAt: daysAgo(365),
    })
    const noMilestone = makeUser({
      id: 'user-nope',
      createdAt: daysAgo(15),
    })

    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantParentMilestones([
        milestone7,
        milestone365,
        noMilestone,
      ]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(2)
    const userIds = notifications.map((n) => n.userId)
    expect(userIds).toContain('user-7day')
    expect(userIds).toContain('user-365day')
  })

  it('skips user within DND window gracefully', async () => {
    const user = makeUser({
      id: 'user-1',
      createdAt: daysAgo(7),
      doNotDisturb: true,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '23:59',
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantParentMilestones([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
