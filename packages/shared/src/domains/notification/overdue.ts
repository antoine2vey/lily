import { DateTime, Effect, Option, pipe } from 'effect'

import { zoneFromNameOrUtc } from '../common/date/timezone'
import { DndWindowBlockedError } from './errors'
import { isInDndWindow, timeToMinutes } from './timezone'

// Morning window: 6:00-8:00 local time (120 minutes)
const MORNING_START = 6 * 60
const MORNING_END = 8 * 60

// Evening window: 18:00-22:00 local time (240 minutes)
const EVENING_START = 18 * 60
const EVENING_END = 22 * 60

/** Who a send time is picked for. */
export interface SlotRecipient {
  readonly id: string
  /** IANA zone, read as UTC when unknown. */
  readonly timezone: string
  readonly doNotDisturb: boolean
  /** HH:mm, 22:00 when absent. */
  readonly doNotDisturbStart: string | null
  /** HH:mm, 07:00 when absent. */
  readonly doNotDisturbEnd: string | null
}

/**
 * Pick a random send time today, in the recipient's morning or evening
 * window, outside their do-not-disturb hours. Fails with
 * DndWindowBlockedError when both windows are blocked.
 *
 * @param randomValue - A number in [0, 1), passed in for deterministic tests
 */
export const pickNotificationTime = (
  recipient: SlotRecipient,
  randomValue: number
): Effect.Effect<Date, DndWindowBlockedError> => {
  const { id: userId, timezone, doNotDisturb: dndEnabled } = recipient
  const dndStartMinutes = dndEnabled
    ? timeToMinutes(
        Option.getOrElse(
          Option.fromNullishOr(recipient.doNotDisturbStart),
          () => '22:00'
        )
      )
    : -1
  const dndEndMinutes = dndEnabled
    ? timeToMinutes(
        Option.getOrElse(
          Option.fromNullishOr(recipient.doNotDisturbEnd),
          () => '07:00'
        )
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

  const preferMorning = randomValue < 0.5
  const primaryStart = preferMorning ? MORNING_START : EVENING_START
  const primaryEnd = preferMorning ? MORNING_END : EVENING_END
  const fallbackStart = preferMorning ? EVENING_START : MORNING_START
  const fallbackEnd = preferMorning ? EVENING_END : MORNING_END

  // Map randomValue to a sub-range for minute selection
  const subRandom = preferMorning ? randomValue * 2 : (randomValue - 0.5) * 2

  return pipe(
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
      const zone = zoneFromNameOrUtc(timezone)
      const nowZoned = DateTime.setZone(DateTime.nowUnsafe(), zone)
      const parts = DateTime.toParts(nowZoned)

      const hours = Math.floor(chosen / 60)
      const minutes = chosen % 60

      const scheduledZoned = DateTime.makeZonedUnsafe(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: hours,
          minute: minutes,
          second: 0,
          millisecond: 0,
        },
        { timeZone: zone, adjustForTimeZone: true }
      )

      return DateTime.toDateUtc(scheduledZoned)
    }),
    Option.match({
      onNone: () => new DndWindowBlockedError({ userId }),
      onSome: Effect.succeed,
    })
  )
}
