import { Array, DateTime, Effect, Option, pipe } from 'effect'

import { zoneFromNameOrUtc } from '../common/date/timezone'
import { DndWindowBlockedError } from './errors'
import { isInDndWindow, timeToMinutes } from './timezone'

/** Minutes of the local day, `end` excluded. */
interface SendWindow {
  readonly start: number
  readonly end: number
}

const MORNING: SendWindow = { start: 6 * 60, end: 8 * 60 }
const EVENING: SendWindow = { start: 18 * 60, end: 22 * 60 }

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
 * The windows a send time may fall in, the one the roll prefers first.
 * A window that do-not-disturb covers is left out.
 */
const openWindows = (
  recipient: SlotRecipient,
  randomValue: number
): ReadonlyArray<SendWindow> => {
  const preferred = randomValue < 0.5 ? [MORNING, EVENING] : [EVENING, MORNING]
  if (!recipient.doNotDisturb) return preferred

  const dndStart = timeToMinutes(
    Option.getOrElse(
      Option.fromNullishOr(recipient.doNotDisturbStart),
      () => '22:00'
    )
  )
  const dndEnd = timeToMinutes(
    Option.getOrElse(
      Option.fromNullishOr(recipient.doNotDisturbEnd),
      () => '07:00'
    )
  )
  // Simplified: a window is covered when its first and last minutes are.
  return Array.filter(
    preferred,
    ({ start, end }) =>
      !(
        isInDndWindow(start, dndStart, dndEnd) &&
        isInDndWindow(end - 1, dndStart, dndEnd)
      )
  )
}

/** Each half of the roll's range spreads over the whole window. */
const minuteIn = ({ start, end }: SendWindow, randomValue: number): number => {
  const position = randomValue < 0.5 ? randomValue * 2 : (randomValue - 0.5) * 2
  return start + Math.floor(position * (end - start))
}

const localNow = (timezone: string) =>
  DateTime.setZone(DateTime.nowUnsafe(), zoneFromNameOrUtc(timezone))

const todayAtMinute = (now: DateTime.Zoned, minute: number): Date => {
  const { year, month, day } = DateTime.toParts(now)
  return DateTime.toDateUtc(
    DateTime.makeZonedUnsafe(
      {
        year,
        month,
        day,
        hour: Math.floor(minute / 60),
        minute: minute % 60,
        second: 0,
        millisecond: 0,
      },
      { timeZone: now.zone, adjustForTimeZone: true }
    )
  )
}

/**
 * Pick a random send time today, in the recipient's morning or evening
 * window, outside their do-not-disturb hours. The time may already be past.
 * Fails with DndWindowBlockedError when both windows are blocked.
 *
 * @param randomValue - A number in [0, 1), passed in for deterministic tests
 */
export const pickNotificationTime = (
  recipient: SlotRecipient,
  randomValue: number
): Effect.Effect<Date, DndWindowBlockedError> =>
  pipe(
    Array.head(openWindows(recipient, randomValue)),
    Option.match({
      onNone: () => new DndWindowBlockedError({ userId: recipient.id }),
      onSome: (window) =>
        Effect.succeed(
          todayAtMinute(
            localNow(recipient.timezone),
            minuteIn(window, randomValue)
          )
        ),
    })
  )

/**
 * Pick a random send time in what is left of today's windows, so it is always
 * after now. None when both are over: a caller that must not send at night
 * waits for the next local day. Fails with DndWindowBlockedError when
 * do-not-disturb blocks both windows.
 *
 * @param randomValue - A number in [0, 1), passed in for deterministic tests
 */
export const pickUpcomingNotificationTime = (
  recipient: SlotRecipient,
  randomValue: number
): Effect.Effect<Option.Option<Date>, DndWindowBlockedError> => {
  const open = openWindows(recipient, randomValue)
  if (Array.isReadonlyArrayEmpty(open)) {
    return Effect.fail(new DndWindowBlockedError({ userId: recipient.id }))
  }
  const now = localNow(recipient.timezone)
  const { hour, minute } = DateTime.toParts(now)
  const nextMinute = hour * 60 + minute + 1
  return Effect.succeed(
    pipe(
      Array.map(open, ({ start, end }) => ({
        start: Math.max(start, nextMinute),
        end,
      })),
      Array.findFirst(({ start, end }) => start < end),
      Option.map((window) => todayAtMinute(now, minuteIn(window, randomValue)))
    )
  )
}
