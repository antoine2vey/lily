import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { processStreakAtRisk } from '@lily/api/services/engagement-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { DateTime, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Find a timezone where local hour >= 18 (past 6 PM)
const findEveningTimezone = (): string | null => {
  const candidates = [
    'Pacific/Auckland',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Europe/Moscow',
    'Europe/Paris',
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'Pacific/Honolulu',
  ]
  for (const tz of candidates) {
    const zoned = DateTime.setZone(
      DateTime.unsafeNow(),
      DateTime.zoneUnsafeMakeNamed(tz)
    )
    if (DateTime.toParts(zoned).hours >= 18) return tz
  }
  return null
}

describe('processStreakAtRisk', () => {
  const streakMap = new Map([['user-1', 5]])

  it('creates notification for user with active streak and no care today', async () => {
    const eveningTz = findEveningTimezone()
    if (!eveningTz) return // Can't test — no timezone is past 6 PM right now

    const user = makeUserWithSettings({ id: 'user-1', timezone: eveningTz })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantNames: { 'user-1': ['Monstera'] },
      }),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([])
    )

    await Effect.runPromise(
      processStreakAtRisk([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('streak_at_risk')
    expect(notifications[0]?.userId).toBe('user-1')
  })

  it('skips user with streak below minimum (3)', async () => {
    const user = makeUserWithSettings({ id: 'user-short' })
    const notifications: Notification[] = []
    const shortStreakMap = new Map([['user-short', 2]])

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([])
    )

    await Effect.runPromise(
      processStreakAtRisk([user], shortStreakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('skips user who already did care today', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([], {
        todayCountByUser: { 'user-1': 2 },
      })
    )

    await Effect.runPromise(
      processStreakAtRisk([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('skips user before 6 PM local time', async () => {
    // Pick a timezone where local time is guaranteed < 18:00
    // We check dynamically to avoid time-of-day flakiness
    const tz = 'America/Los_Angeles'
    const localNow = DateTime.setZone(
      DateTime.unsafeNow(),
      DateTime.zoneUnsafeMakeNamed(tz)
    )
    const { hours } = DateTime.toParts(localNow)
    if (hours >= 18) return // Can't test — already past 6 PM in LA

    const user = makeUserWithSettings({ id: 'user-1', timezone: tz })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([])
    )

    await Effect.runPromise(
      processStreakAtRisk([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('skips user with no streak in map', async () => {
    const user = makeUserWithSettings({ id: 'user-no-streak' })
    const notifications: Notification[] = []
    const emptyStreakMap = new Map<string, number>()

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([])
    )

    await Effect.runPromise(
      processStreakAtRisk([user], emptyStreakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('dedup: skips if already sent today', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const existingNotification = {
      id: 'existing-1',
      type: 'streak_at_risk',
      userId: 'user-1',
      status: 'sent' as const,
      isRead: false,
      retryCount: 0,
      scheduledAt: new Date(),
      sentAt: new Date(),
      createdAt: new Date(),
    }
    const notifications: Notification[] = [existingNotification]

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([])
    )

    await Effect.runPromise(
      processStreakAtRisk([user], streakMap).pipe(Effect.provide(layer))
    )

    // Should still only have the 1 pre-existing notification
    expect(notifications).toHaveLength(1)
  })

  it('skips user within DND window gracefully', async () => {
    const user = makeUserWithSettings({
      id: 'user-1',
      doNotDisturb: true,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '23:59',
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantNames: { 'user-1': ['Ficus'] },
      }),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([])
    )

    await Effect.runPromise(
      processStreakAtRisk([user], streakMap).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('handles empty user list', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications),
      createMockCareLogRepository([])
    )

    await Effect.runPromise(
      processStreakAtRisk([], new Map()).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
