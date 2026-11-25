import { Array, DateTime, Effect, Option, pipe } from 'effect'
import { zoneFromName } from '../common/date/timezone'
import type { ZoneName } from '../common/date/zone-name'
import { DndWindowBlockedError } from './errors'
import {
  DEFAULT_DND_END,
  DEFAULT_DND_START,
  dndBoundOr,
  timeToMinutes,
} from './timezone'

/** Minutes of the local day, `end` excluded. */
interface MinuteRange {
  readonly start: number
  readonly end: number
}

const MORNING: MinuteRange = { start: 6 * 60, end: 8 * 60 }
const EVENING: MinuteRange = { start: 18 * 60, end: 22 * 60 }
const END_OF_DAY = 24 * 60

/** Who a send time is picked for. */
export interface SlotRecipient {
  readonly id: string
  /** The zone the windows are read in. */
  readonly timezone: ZoneName
  readonly doNotDisturb: boolean
  /** HH:mm, 22:00 when absent. */
  readonly doNotDisturbStart: string | null
  /** HH:mm, 07:00 when absent. */
  readonly doNotDisturbEnd: string | null
}

/** What do-not-disturb covers. A range that crosses midnight is two. */
const dndRanges = (recipient: SlotRecipient): ReadonlyArray<MinuteRange> => {
  if (!recipient.doNotDisturb) return []

  const start = timeToMinutes(
    dndBoundOr(recipient.doNotDisturbStart, DEFAULT_DND_START)
  )
  const end = timeToMinutes(
    dndBoundOr(recipient.doNotDisturbEnd, DEFAULT_DND_END)
  )
  if (start === end) return []
  return start < end
    ? [{ start, end }]
    : [
        { start: 0, end },
        { start, end: END_OF_DAY },
      ]
}

const hasMinutes = ({ start, end }: MinuteRange): boolean => start < end

/** The parts of `range` before and after `cut`. */
const without = (
  range: MinuteRange,
  cut: MinuteRange
): ReadonlyArray<MinuteRange> =>
  Array.filter(
    [
      { start: range.start, end: Math.min(range.end, cut.start) },
      { start: Math.max(range.start, cut.end), end: range.end },
    ],
    hasMinutes
  )

/**
 * The minutes of each send window that do-not-disturb leaves open, in
 * ascending ranges, the window the roll prefers first. A window with no open
 * minute is left out.
 */
const openWindows = (
  recipient: SlotRecipient,
  randomValue: number
): ReadonlyArray<ReadonlyArray<MinuteRange>> =>
  pipe(
    randomValue < 0.5 ? [MORNING, EVENING] : [EVENING, MORNING],
    Array.map((window) =>
      Array.reduce(
        dndRanges(recipient),
        [window] as ReadonlyArray<MinuteRange>,
        (open, cut) => Array.flatMap(open, (range) => without(range, cut))
      )
    ),
    Array.filter(Array.isReadonlyArrayNonEmpty)
  )

/** Each half of the roll's range spreads over every open minute. */
const minuteIn = (
  open: ReadonlyArray<MinuteRange>,
  randomValue: number
): number => {
  const position = randomValue < 0.5 ? randomValue * 2 : (randomValue - 0.5) * 2
  const offset = Math.floor(
    position * Array.reduce(open, 0, (total, r) => total + r.end - r.start)
  )
  // The ranges ascend, so the last one that starts at or before the offset
  // holds it.
  return Array.reduce(
    open,
    { before: 0, minute: 0 },
    ({ before, minute }, { start, end }) => ({
      before: before + end - start,
      minute: offset >= before ? start + offset - before : minute,
    })
  ).minute
}

const localNow = (timezone: ZoneName) =>
  DateTime.setZone(DateTime.nowUnsafe(), zoneFromName(timezone))

/** `minute` of the local day `now` falls on, or of a later one. */
const atMinute = (now: DateTime.Zoned, minute: number, daysLater = 0): Date => {
  const { year, month, day } = DateTime.toParts(now)
  return DateTime.toDateUtc(
    DateTime.makeZonedUnsafe(
      {
        year,
        month,
        day: day + daysLater,
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
          atMinute(localNow(recipient.timezone), minuteIn(window, randomValue))
        ),
    })
  )

/** A slot in what is left of today's `open` windows, none when they are over. */
const upcomingToday = (
  open: ReadonlyArray<ReadonlyArray<MinuteRange>>,
  now: DateTime.Zoned,
  randomValue: number
): Option.Option<Date> => {
  const { hour, minute } = DateTime.toParts(now)
  const nextMinute = hour * 60 + minute + 1
  return pipe(
    Array.map(open, (window) =>
      Array.flatMap(window, (range) =>
        without(range, { start: 0, end: nextMinute })
      )
    ),
    Array.findFirst(Array.isReadonlyArrayNonEmpty),
    Option.map((left) => atMinute(now, minuteIn(left, randomValue)))
  )
}

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
  return Effect.succeed(
    upcomingToday(open, localNow(recipient.timezone), randomValue)
  )
}

/**
 * Pick a random send time after now: in what is left of today's windows, or
 * else in the next local day's. For a notice that fires once and is lost if
 * skipped. Fails with DndWindowBlockedError when do-not-disturb blocks both
 * windows.
 *
 * @param randomValue - A number in [0, 1), passed in for deterministic tests
 */
export const pickNextNotificationTime = (
  recipient: SlotRecipient,
  randomValue: number
): Effect.Effect<Date, DndWindowBlockedError> => {
  const open = openWindows(recipient, randomValue)
  return pipe(
    Array.head(open),
    Option.match({
      onNone: () => new DndWindowBlockedError({ userId: recipient.id }),
      onSome: (preferred) => {
        const now = localNow(recipient.timezone)
        return Effect.succeed(
          Option.getOrElse(upcomingToday(open, now, randomValue), () =>
            atMinute(now, minuteIn(preferred, randomValue), 1)
          )
        )
      },
    })
  )
}
