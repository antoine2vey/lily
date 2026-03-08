import { DateTime, Option, pipe } from 'effect'

import { DEFAULT_TIMEZONE, isInDndWindow, timeToMinutes } from './timezone'

// Morning window: 6:00-8:00 local time (120 minutes)
const MORNING_START = 6 * 60 // 360
const MORNING_END = 8 * 60 // 480

// Evening window: 18:00-22:00 local time (240 minutes)
const EVENING_START = 18 * 60 // 1080
const EVENING_END = 22 * 60 // 1320

export type OverduePlant = {
  id: string
  name: string
  userId: string
  nextWateringAt: Date
}

/**
 * Pure function to pick a random notification time within the morning or evening
 * window, respecting DND settings. Returns Option.none() if both windows are blocked.
 *
 * @param timezone - IANA timezone string
 * @param dndEnabled - Whether DND is active
 * @param dndStart - DND start time in HH:mm format
 * @param dndEnd - DND end time in HH:mm format
 * @param randomValue - A number in [0, 1) for deterministic testing
 * @returns Option<Date> - UTC Date for the scheduled notification, or None if blocked
 */
export const pickOverdueNotificationTime = (
  timezone: string,
  dndEnabled: boolean,
  dndStart: string | null,
  dndEnd: string | null,
  randomValue: number
): Option.Option<Date> => {
  const dndStartMinutes = dndEnabled
    ? timeToMinutes(
        Option.getOrElse(Option.fromNullable(dndStart), () => '22:00')
      )
    : -1
  const dndEndMinutes = dndEnabled
    ? timeToMinutes(
        Option.getOrElse(Option.fromNullable(dndEnd), () => '07:00')
      )
    : -1

  const isWindowBlocked = (startMin: number, endMin: number): boolean => {
    if (!dndEnabled) return false
    // Check if every minute in the window is within DND
    // Simplified: check start and end-1 of the window
    return (
      isInDndWindow(startMin, dndStartMinutes, dndEndMinutes) &&
      isInDndWindow(endMin - 1, dndStartMinutes, dndEndMinutes)
    )
  }

  const pickTimeInWindow = (
    windowStart: number,
    windowEnd: number,
    rv: number
  ): number => {
    const range = windowEnd - windowStart
    return windowStart + Math.floor(rv * range)
  }

  // Pick primary window based on randomValue
  const preferMorning = randomValue < 0.5
  const primaryStart = preferMorning ? MORNING_START : EVENING_START
  const primaryEnd = preferMorning ? MORNING_END : EVENING_END
  const fallbackStart = preferMorning ? EVENING_START : MORNING_START
  const fallbackEnd = preferMorning ? EVENING_END : MORNING_END

  // Map randomValue to a sub-range for minute selection
  const subRandom = preferMorning ? randomValue * 2 : (randomValue - 0.5) * 2

  return pipe(
    // Try primary window, fall back to secondary
    Option.some(primaryStart),
    Option.filter(() => !isWindowBlocked(primaryStart, primaryEnd)),
    Option.map(() => pickTimeInWindow(primaryStart, primaryEnd, subRandom)),
    Option.orElse(() =>
      pipe(
        Option.some(fallbackStart),
        Option.filter(() => !isWindowBlocked(fallbackStart, fallbackEnd)),
        Option.map(() =>
          pickTimeInWindow(fallbackStart, fallbackEnd, subRandom)
        )
      )
    ),
    // Convert chosen local time to UTC Date for today in the user's timezone
    Option.map((chosen) => {
      const zoneOption = DateTime.zoneMakeNamed(timezone)
      const validTimezone = pipe(
        zoneOption,
        Option.map(() => timezone),
        Option.getOrElse(() => DEFAULT_TIMEZONE)
      )
      const zone = pipe(
        zoneOption,
        Option.getOrElse(() => DateTime.zoneUnsafeMakeNamed(DEFAULT_TIMEZONE))
      )

      const nowZoned = DateTime.setZone(DateTime.unsafeNow(), zone)
      const parts = DateTime.toParts(nowZoned)

      const hours = Math.floor(chosen / 60)
      const minutes = chosen % 60

      const scheduledZoned = DateTime.unsafeMakeZoned(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hours,
          minutes,
          seconds: 0,
          millis: 0,
        },
        { timeZone: validTimezone, adjustForTimeZone: true }
      )

      return DateTime.toDateUtc(scheduledZoned)
    })
  )
}
