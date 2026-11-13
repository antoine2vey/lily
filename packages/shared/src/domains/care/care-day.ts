import { DateTime, Duration, Schema } from 'effect'

import { localDayKey } from '../common/date/timezone'

/** A calendar day (`YYYY-MM-DD`) in a plant's care context. */
export const CareDay = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Care day must be YYYY-MM-DD',
  })
).pipe(Schema.brand('CareDay'))
export type CareDay = typeof CareDay.Type

const MS_PER_DAY = Duration.toMillis(Duration.days(1))

const utcMidnight = (day: CareDay): DateTime.Utc =>
  DateTime.makeUnsafe(`${day}T00:00:00.000Z`)

const of = (instant: DateTime.DateTime, timezone: string): CareDay =>
  CareDay.make(localDayKey(instant, timezone))

const addDays = (day: CareDay, days: number): CareDay =>
  of(DateTime.add(utcMidnight(day), { days }), 'UTC')

/** `to - from` in whole days; negative when `to` is before `from`. */
const daysBetween = (from: CareDay, to: CareDay): number =>
  (DateTime.toEpochMillis(utcMidnight(to)) -
    DateTime.toEpochMillis(utcMidnight(from))) /
  MS_PER_DAY

const startOf = (day: CareDay, timezone: string): DateTime.Utc => {
  const parts = DateTime.toPartsUtc(utcMidnight(day))
  return DateTime.toUtc(
    DateTime.makeZonedUnsafe(
      { year: parts.year, month: parts.month, day: parts.day },
      { timeZone: timezone, adjustForTimeZone: true }
    )
  )
}

export const CareDays = {
  of,
  today: (timezone: string, now: DateTime.DateTime): CareDay =>
    of(now, timezone),
  startOf,
  addDays,
  daysBetween,
  isBefore: (day: CareDay, other: CareDay): boolean => day < other,
  latest: (day: CareDay, other: CareDay): CareDay =>
    day < other ? other : day,
} as const
