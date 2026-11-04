import {
  adjustForDoNotDisturb,
  decodeDndBounds,
  isInDoNotDisturbWindow,
} from '@lily/api/services/notifications/timezone-scheduler'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const adjust = (
  scheduledAt: Date,
  timezone: string | null,
  dndStart: string | null,
  dndEnd: string | null
) =>
  Effect.flatMap(decodeDndBounds(dndStart, dndEnd), (bounds) =>
    adjustForDoNotDisturb(scheduledAt, timezone, bounds)
  )

const inWindow = (
  currentTime: Date,
  timezone: string | null,
  dndStart: string | null,
  dndEnd: string | null
) =>
  Effect.flatMap(decodeDndBounds(dndStart, dndEnd), (bounds) =>
    isInDoNotDisturbWindow(currentTime, timezone, bounds)
  )

describe('adjustForDoNotDisturb', () => {
  describe('wrapping window (22:00 → 07:00)', () => {
    const dndStart = '22:00'
    const dndEnd = '07:00'

    it('should not adjust time before DND start (21:59)', async () => {
      // 21:59 UTC
      const scheduledAt = new Date('2025-06-15T21:59:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })

    it('should adjust time exactly at DND start (22:00) to 07:00 next day', async () => {
      // 22:00 UTC
      const scheduledAt = new Date('2025-06-15T22:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCMinutes()).toBe(0)
      // Should be next day since 22:00 >= start
      expect(result.getUTCDate()).toBe(16)
    })

    it('should adjust time during DND evening (23:00) to 07:00 next day', async () => {
      const scheduledAt = new Date('2025-06-15T23:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCMinutes()).toBe(0)
      expect(result.getUTCDate()).toBe(16)
    })

    it('should adjust time at midnight (00:00) to 07:00 same day', async () => {
      const scheduledAt = new Date('2025-06-15T00:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCMinutes()).toBe(0)
      // Same day since midnight < start (no next-day bump)
      expect(result.getUTCDate()).toBe(15)
    })

    it('should adjust time during DND morning (02:00) to 07:00 same day', async () => {
      const scheduledAt = new Date('2025-06-15T02:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCMinutes()).toBe(0)
      expect(result.getUTCDate()).toBe(15)
    })

    it('should not adjust time exactly at DND end (07:00)', async () => {
      const scheduledAt = new Date('2025-06-15T07:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })

    it('should not adjust time after DND end (07:01)', async () => {
      const scheduledAt = new Date('2025-06-15T07:01:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })

    it('should not adjust time at noon (12:00)', async () => {
      const scheduledAt = new Date('2025-06-15T12:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })
  })

  describe('non-wrapping window (01:00 → 06:00)', () => {
    const dndStart = '01:00'
    const dndEnd = '06:00'

    it('should not adjust time before window (00:59)', async () => {
      const scheduledAt = new Date('2025-06-15T00:59:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })

    it('should adjust time exactly at start (01:00) to 06:00', async () => {
      const scheduledAt = new Date('2025-06-15T01:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.getUTCHours()).toBe(6)
      expect(result.getUTCMinutes()).toBe(0)
      expect(result.getUTCDate()).toBe(15)
    })

    it('should adjust time inside window (03:30) to 06:00', async () => {
      const scheduledAt = new Date('2025-06-15T03:30:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.getUTCHours()).toBe(6)
      expect(result.getUTCMinutes()).toBe(0)
    })

    it('should not adjust time exactly at end (06:00)', async () => {
      const scheduledAt = new Date('2025-06-15T06:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })

    it('should not adjust time after window (06:01)', async () => {
      const scheduledAt = new Date('2025-06-15T06:01:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', dndStart, dndEnd)
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })
  })

  describe('timezone handling', () => {
    it('should handle America/New_York timezone correctly', async () => {
      // 3 AM UTC = 11 PM ET (prev day) during EDT (UTC-4)
      // With DND 22:00-07:00 ET, 11 PM ET is in DND
      const scheduledAt = new Date('2025-06-15T03:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'America/New_York', '22:00', '07:00')
      )

      // 07:00 ET (EDT = UTC-4) → 11:00 UTC
      expect(result.getUTCHours()).toBe(11)
      expect(result.getUTCMinutes()).toBe(0)
    })

    it('should handle Asia/Tokyo timezone correctly', async () => {
      // 14:00 UTC = 23:00 JST (UTC+9)
      // With DND 22:00-07:00 JST, 23:00 is in DND
      const scheduledAt = new Date('2025-06-15T14:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'Asia/Tokyo', '22:00', '07:00')
      )

      // 07:00 JST (UTC+9) → 22:00 UTC (previous day)
      expect(result.getUTCHours()).toBe(22)
      expect(result.getUTCMinutes()).toBe(0)
    })

    it('should handle UTC timezone directly', async () => {
      const scheduledAt = new Date('2025-06-15T23:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', '22:00', '07:00')
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCDate()).toBe(16)
    })

    it('should fall back to UTC for invalid timezone', async () => {
      // With invalid timezone, falls back to UTC
      // 23:00 UTC is in DND 22:00-07:00 UTC
      const scheduledAt = new Date('2025-06-15T23:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'Invalid/Timezone', '22:00', '07:00')
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCDate()).toBe(16)
    })
  })

  describe('daylight saving nights', () => {
    it('should land on 07:00 local when the clocks go forward overnight', async () => {
      // Pacific/Auckland moves from NZST (UTC+12) to NZDT (UTC+13) at
      // 02:00 on 2026-09-27, so the night is 23 hours long
      const scheduledAt = new Date('2026-09-26T11:30:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'Pacific/Auckland', '22:00', '07:00')
      )

      expect(result.toISOString()).toBe('2026-09-26T18:00:00.000Z')
    })

    it('should land on 07:00 local when the clocks go back overnight', async () => {
      // Pacific/Auckland moves from NZDT (UTC+13) to NZST (UTC+12) at
      // 03:00 on 2027-04-04, so the night is 25 hours long
      const scheduledAt = new Date('2027-04-03T10:30:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'Pacific/Auckland', '22:00', '07:00')
      )

      expect(result.toISOString()).toBe('2027-04-03T19:00:00.000Z')
    })

    it('should land on the next day end when today has no such local time', async () => {
      // America/New_York skips 02:00-03:00 on 2026-03-08. At 23:00 EDT that
      // evening, the 02:30 end is on 2026-03-09, which has an 02:30.
      const scheduledAt = new Date('2026-03-09T03:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'America/New_York', '22:00', '02:30')
      )

      expect(result.toISOString()).toBe('2026-03-09T06:30:00.000Z')
    })

    it('known limit: lands 30 min after the DND end when the end is in the skipped hour', async () => {
      // 23:00 EST on 2026-03-07: the 02:30 end does not exist on 2026-03-08,
      // so it resolves forward to 03:30 EDT, while DND really ends at 03:00 EDT.
      const scheduledAt = new Date('2026-03-08T04:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'America/New_York', '22:00', '02:30')
      )

      expect(result.toISOString()).toBe('2026-03-08T07:30:00.000Z')
    })
  })

  describe('edge cases', () => {
    it('should not adjust when DND start equals end (no window)', async () => {
      const scheduledAt = new Date('2025-06-15T12:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', '22:00', '22:00')
      )

      expect(result.toISOString()).toBe(scheduledAt.toISOString())
    })

    it('should use default DND times when null values provided', async () => {
      // null start/end → defaults to 22:00-07:00
      // 23:00 UTC is in default DND window
      const scheduledAt = new Date('2025-06-15T23:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', null, null)
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCDate()).toBe(16)
    })

    it('should handle notification right at day boundary (23:59)', async () => {
      const scheduledAt = new Date('2025-06-15T23:59:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', '22:00', '07:00')
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCDate()).toBe(16)
    })

    it('should fall back to the default end for an unparseable stored end', async () => {
      const scheduledAt = new Date('2025-06-15T23:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', '22:00', '9999999999:00')
      )

      expect(result.toISOString()).toBe('2025-06-16T07:00:00.000Z')
    })

    it('should fall back to the default start for an unparseable stored start', async () => {
      const scheduledAt = new Date('2025-06-15T23:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, 'UTC', 'abc', '07:00')
      )

      expect(result.toISOString()).toBe('2025-06-16T07:00:00.000Z')
    })

    it('should handle null timezone by falling back to UTC', async () => {
      const scheduledAt = new Date('2025-06-15T23:00:00Z')

      const result = await Effect.runPromise(
        adjust(scheduledAt, null, '22:00', '07:00')
      )

      expect(result.getUTCHours()).toBe(7)
      expect(result.getUTCDate()).toBe(16)
    })
  })
})

describe('isInDoNotDisturbWindow', () => {
  it('should return true when current time is in DND window', async () => {
    const currentTime = new Date('2025-06-15T23:00:00Z')

    const result = await Effect.runPromise(
      inWindow(currentTime, 'UTC', '22:00', '07:00')
    )

    expect(result).toBe(true)
  })

  it('should return false when current time is outside DND window', async () => {
    const currentTime = new Date('2025-06-15T12:00:00Z')

    const result = await Effect.runPromise(
      inWindow(currentTime, 'UTC', '22:00', '07:00')
    )

    expect(result).toBe(false)
  })

  it('should return false when DND start equals end', async () => {
    const currentTime = new Date('2025-06-15T22:00:00Z')

    const result = await Effect.runPromise(
      inWindow(currentTime, 'UTC', '22:00', '22:00')
    )

    expect(result).toBe(false)
  })

  it('should handle timezone-aware DND check', async () => {
    // 3 AM UTC = 11 PM ET (during EDT)
    const currentTime = new Date('2025-06-15T03:00:00Z')

    const result = await Effect.runPromise(
      inWindow(currentTime, 'America/New_York', '22:00', '07:00')
    )

    expect(result).toBe(true)
  })

  it('should read an unparseable stored end as the default end', async () => {
    const currentTime = new Date('2025-06-15T03:00:00Z')

    const result = await Effect.runPromise(
      inWindow(currentTime, 'UTC', '22:00', '9999999999:00')
    )

    expect(result).toBe(true)
  })

  it('should return false at exactly DND end time', async () => {
    const currentTime = new Date('2025-06-15T07:00:00Z')

    const result = await Effect.runPromise(
      inWindow(currentTime, 'UTC', '22:00', '07:00')
    )

    expect(result).toBe(false)
  })
})
