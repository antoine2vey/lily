import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
import type { UserWithSettings } from '@lily/api/repositories/engagement.repository'
import { runRules } from '@lily/api/services/helpers/engagement-rules'
import { weeklyRecap } from '@lily/api/services/weekly-recap-scheduler/scheduler'
import { ZoneName } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { DateTime, Effect, Layer } from 'effect'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

// Find a timezone where it's currently Sunday, or null if none found
const findSundayTimezone = (): ZoneName | null => {
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
      DateTime.nowUnsafe(),
      DateTime.zoneMakeNamedUnsafe(tz)
    )
    if (DateTime.toParts(zoned).weekDay === 0) return ZoneName.make(tz)
  }
  return null
}

// Find a timezone where it's currently NOT Sunday
const findNonSundayTimezone = (): ZoneName | null => {
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
      DateTime.nowUnsafe(),
      DateTime.zoneMakeNamedUnsafe(tz)
    )
    if (DateTime.toParts(zoned).weekDay !== 0) return ZoneName.make(tz)
  }
  return null
}

const processWeeklyRecap = (users: ReadonlyArray<UserWithSettings>) =>
  runRules('weekly-recap-scheduler', users, [weeklyRecap])

describe('processWeeklyRecap', () => {
  it('creates recap notification on Sunday for user with activity', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
    onTestFinished(() => {
      vi.useRealTimers()
    })

    const user = makeUserWithSettings({
      id: 'user-1',
      timezone: ZoneName.make('UTC'),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        careLogsForWeek: { 'user-1': 8 },
        healthyPlantCounts: { 'user-1': 5 },
      }),
      notificationMocks(notifications).repository,
      createMockAchievementRepository({
        achievements: [],
        careStreak: 4,
      })
    )

    await Effect.runPromise(
      processWeeklyRecap([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      type: 'weekly_recap',
      userId: 'user-1',
      status: 'pending',
      metadata: {},
    })
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
      notificationMocks(notifications).repository,
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
      notificationMocks(notifications).repository,
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
    const sent = createTestNotification({
      userId: 'user-1',
      type: 'weekly_recap',
    })
    const notifications: Notification[] = [sent]

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        careLogsForWeek: { 'user-1': 5 },
        healthyPlantCounts: { 'user-1': 3 },
      }),
      notificationMocks(notifications).repository,
      createMockAchievementRepository({
        achievements: [],
        careStreak: 7,
      })
    )

    await Effect.runPromise(
      processWeeklyRecap([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toEqual([sent])
  })

  it('handles empty user list', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      notificationMocks(notifications).repository,
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
      notificationMocks(notifications).repository,
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
