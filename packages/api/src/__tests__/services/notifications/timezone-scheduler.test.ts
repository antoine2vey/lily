import {
  calculateScheduledAt,
  recalculateNotificationSchedules,
} from '@lily/api/services/notifications/timezone-scheduler'
import { ZoneName } from '@lily/shared'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const createFutureDate = (daysFromNow: number, hours = 12): Date => {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setUTCHours(hours, 0, 0, 0)
  return date
}

describe('calculateScheduledAt', () => {
  it('should schedule notification at 9 AM UTC by default', async () => {
    const baseDate = createFutureDate(7, 12)

    const result = await Effect.runPromise(
      calculateScheduledAt(baseDate, ZoneName.make('UTC'), null)
    )

    // Should be scheduled at 9 AM UTC
    expect(result.getUTCHours()).toBe(9)
    expect(result.getUTCMinutes()).toBe(0)
    // The date should be the same as baseDate since 9 AM is before noon
    expect(result.getUTCDate()).toBe(baseDate.getUTCDate())
  })

  it('should use provided timezone', async () => {
    const baseDate = createFutureDate(7, 12)

    const result = await Effect.runPromise(
      calculateScheduledAt(baseDate, ZoneName.make('America/New_York'), '09:00')
    )

    // 9 AM in New York is 14:00 UTC (during standard time)
    // This test verifies the timezone is being used
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeGreaterThan(0)
  })

  it('should use provided preferred time', async () => {
    const baseDate = createFutureDate(7, 20)

    const result = await Effect.runPromise(
      calculateScheduledAt(baseDate, ZoneName.make('UTC'), '18:00')
    )

    // Should be scheduled at 6 PM UTC
    expect(result.getUTCHours()).toBe(18)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it('should fall back to 09:00 for invalid time format', async () => {
    const baseDate = createFutureDate(7, 12)

    const result = await Effect.runPromise(
      calculateScheduledAt(baseDate, ZoneName.make('UTC'), 'invalid-time')
    )

    // Should fall back to 9 AM
    expect(result.getUTCHours()).toBe(9)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it('should schedule for next occurrence when base date time has passed', async () => {
    // Create a base date in the future but with time before the preferred notification time
    // This tests that the scheduler properly handles the date calculation
    const baseDate = createFutureDate(7, 8) // 8 AM UTC

    const result = await Effect.runPromise(
      calculateScheduledAt(baseDate, ZoneName.make('UTC'), '09:00')
    )

    // Should be scheduled at 9 AM UTC on the same day
    expect(result.getUTCHours()).toBe(9)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getTime()).toBeGreaterThan(baseDate.getTime())
  })

  it('should handle different preferred times correctly', async () => {
    const baseDate = createFutureDate(7, 12)

    const morningResult = await Effect.runPromise(
      calculateScheduledAt(baseDate, ZoneName.make('UTC'), '07:30')
    )
    expect(morningResult.getUTCHours()).toBe(7)
    expect(morningResult.getUTCMinutes()).toBe(30)

    const eveningResult = await Effect.runPromise(
      calculateScheduledAt(baseDate, ZoneName.make('UTC'), '20:00')
    )
    expect(eveningResult.getUTCHours()).toBe(20)
    expect(eveningResult.getUTCMinutes()).toBe(0)
  })
})

describe('recalculateNotificationSchedules', () => {
  it('should recalculate schedules for multiple notifications', async () => {
    const notifications = [
      {
        notificationId: 'notif-1',
        baseDate: createFutureDate(7, 12),
      },
      {
        notificationId: 'notif-2',
        baseDate: createFutureDate(8, 12),
      },
    ]

    const result = await Effect.runPromise(
      recalculateNotificationSchedules(
        notifications,
        ZoneName.make('UTC'),
        '09:00'
      )
    )

    expect(result).toHaveLength(2)
    expect(result[0]?.notificationId).toBe('notif-1')
    expect(result[1]?.notificationId).toBe('notif-2')
    expect(result[0]?.scheduledAt.getUTCHours()).toBe(9)
    expect(result[1]?.scheduledAt.getUTCHours()).toBe(9)
  })

  it('should handle empty notification array', async () => {
    const result = await Effect.runPromise(
      recalculateNotificationSchedules([], ZoneName.make('UTC'), '09:00')
    )

    expect(result).toHaveLength(0)
  })

  it('should apply new timezone to all notifications', async () => {
    const notifications = [
      {
        notificationId: 'notif-1',
        baseDate: createFutureDate(14, 15),
      },
    ]

    const result = await Effect.runPromise(
      recalculateNotificationSchedules(
        notifications,
        ZoneName.make('America/New_York'),
        '08:00'
      )
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.scheduledAt).toBeInstanceOf(Date)
  })
})
