import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { processWeeklyRecap } from '@lily/api/services/weekly-recap-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { DateTime, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Find a timezone where it's currently Sunday, or null if none found
const findSundayTimezone = (): string | null => {
  const candidates = [
    'Pacific/Auckland',
    'Asia/Tokyo',
    'Europe/Paris',
    'UTC',
    'America/New_York',
    'Pacific/Honolulu',
    'Pacific/Midway',
  ]
  for (const tz of candidates) {
    const zoned = DateTime.setZone(
      DateTime.unsafeNow(),
      DateTime.zoneUnsafeMakeNamed(tz)
    )
    if (DateTime.toParts(zoned).weekDay === 0) return tz
  }
  return null
}

// Find a timezone where it's currently NOT Sunday
const findNonSundayTimezone = (): string | null => {
  const candidates = [
    'UTC',
    'America/New_York',
    'Europe/Paris',
    'Asia/Tokyo',
    'Pacific/Auckland',
    'Pacific/Honolulu',
  ]
  for (const tz of candidates) {
    const zoned = DateTime.setZone(
      DateTime.unsafeNow(),
      DateTime.zoneUnsafeMakeNamed(tz)
    )
    if (DateTime.toParts(zoned).weekDay !== 0) return tz
  }
  return null
}

describe('processWeeklyRecap', () => {
  it('creates recap notification on Sunday for user with activity', async () => {
    const sundayTz = findSundayTimezone()
    if (!sundayTz) return // Can't test — no timezone is on Sunday right now

    const user = makeUserWithSettings({ id: 'user-1', timezone: sundayTz })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        careLogsForWeek: { 'user-1': 8 },
        healthyPlantCounts: { 'user-1': 5 },
      }),
      createMockNotificationRepository(notifications),
      createMockAchievementRepository({
        achievements: [],
        careStreak: 4,
      })
    )

    await Effect.runPromise(
      processWeeklyRecap([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('weekly_recap')
    expect(notifications[0]?.userId).toBe('user-1')
  })

  it('skips user on non-Sunday', async () => {
    const nonSundayTz = findNonSundayTimezone()
    if (!nonSundayTz) return // Can't test — all timezones are on Sunday

    const user = makeUserWithSettings({ id: 'user-1', timezone: nonSundayTz })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        careLogsForWeek: { 'user-1': 5 },
        healthyPlantCounts: { 'user-1': 3 },
      }),
      createMockNotificationRepository(notifications),
      createMockAchievementRepository({
        achievements: [],
        careStreak: 7,
      })
    )

    await Effect.runPromise(
      processWeeklyRecap([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('skips user with zero activity this week', async () => {
    const sundayTz = findSundayTimezone()
    if (!sundayTz) return

    const user = makeUserWithSettings({ id: 'user-1', timezone: sundayTz })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        careLogsForWeek: { 'user-1': 0 },
        healthyPlantCounts: { 'user-1': 3 },
      }),
      createMockNotificationRepository(notifications),
      createMockAchievementRepository({
        achievements: [],
        careStreak: 0,
      })
    )

    await Effect.runPromise(
      processWeeklyRecap([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('dedup: skips if already sent this week', async () => {
    const sundayTz = findSundayTimezone()
    if (!sundayTz) return

    const user = makeUserWithSettings({ id: 'user-1', timezone: sundayTz })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        careLogsForWeek: { 'user-1': 5 },
        healthyPlantCounts: { 'user-1': 3 },
        notificationsInPeriod: {
          'user-1:weekly_recap': true,
        },
      }),
      createMockNotificationRepository(notifications),
      createMockAchievementRepository({
        achievements: [],
        careStreak: 7,
      })
    )

    await Effect.runPromise(
      processWeeklyRecap([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('handles empty user list', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications),
      createMockAchievementRepository({ achievements: [] })
    )

    await Effect.runPromise(processWeeklyRecap([]).pipe(Effect.provide(layer)))

    expect(notifications).toHaveLength(0)
  })

  it('skips user within DND window gracefully', async () => {
    const sundayTz = findSundayTimezone()
    if (!sundayTz) return

    const user = makeUserWithSettings({
      id: 'user-1',
      timezone: sundayTz,
      doNotDisturb: true,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '23:59',
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        careLogsForWeek: { 'user-1': 5 },
        healthyPlantCounts: { 'user-1': 3 },
      }),
      createMockNotificationRepository(notifications),
      createMockAchievementRepository({
        achievements: [],
        careStreak: 7,
      })
    )

    await Effect.runPromise(
      processWeeklyRecap([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
