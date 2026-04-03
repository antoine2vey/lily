import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { processStreakMilestones } from '@lily/api/services/engagement-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('processStreakMilestones', () => {
  it('creates notification on exact 7-day streak milestone', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const streakMap = new Map([['user-1', 7]])
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processStreakMilestones([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('streak_milestone')
    expect(notifications[0]?.userId).toBe('user-1')
  })

  it('creates notification on 30-day streak milestone', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const streakMap = new Map([['user-1', 30]])
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processStreakMilestones([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('streak_milestone')
  })

  it('skips non-milestone streak value', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const streakMap = new Map([['user-1', 8]])
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processStreakMilestones([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('skips user with zero streak', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const streakMap = new Map<string, number>()
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processStreakMilestones([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('dedup: skips if already sent for this milestone', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const streakMap = new Map([['user-1', 14]])
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        notificationsInPeriod: {
          'user-1:streak_milestone': true,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processStreakMilestones([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('handles multiple users with different milestone eligibility', async () => {
    const users = [
      makeUserWithSettings({ id: 'user-7' }),
      makeUserWithSettings({ id: 'user-90' }),
      makeUserWithSettings({ id: 'user-nope' }),
    ]
    const streakMap = new Map([
      ['user-7', 7],
      ['user-90', 90],
      ['user-nope', 5],
    ])
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processStreakMilestones(users, streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(2)
    const userIds = notifications.map((n) => n.userId)
    expect(userIds).toContain('user-7')
    expect(userIds).toContain('user-90')
  })

  it('skips user within DND window gracefully', async () => {
    const user = makeUserWithSettings({
      id: 'user-1',
      doNotDisturb: true,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '23:59',
    })
    const streakMap = new Map([['user-1', 7]])
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processStreakMilestones([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
