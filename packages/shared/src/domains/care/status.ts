import { DateTime, Match, Option, pipe, Schema } from 'effect'

import { type CareDay, CareDays } from './care-day'

export const CareStatus = Schema.TaggedUnion({
  Upcoming: { inDays: Schema.Int },
  DueToday: {},
  Overdue: { daysLate: Schema.Int },
})
export type CareStatus = typeof CareStatus.Type

/**
 * The status of a schedule on `today`, both in the plant's care context.
 * A care is overdue from the day after its due day.
 */
export const careStatus = (dueDay: CareDay, today: CareDay): CareStatus =>
  Match.value(CareDays.daysBetween(today, dueDay)).pipe(
    Match.when(0, (): CareStatus => ({ _tag: 'DueToday' })),
    Match.when(
      (days) => days > 0,
      (inDays): CareStatus => ({ _tag: 'Upcoming', inDays })
    ),
    Match.orElse((days): CareStatus => ({ _tag: 'Overdue', daysLate: -days }))
  )

export const dueDayAndStatus = (
  dueAt: Date | null,
  careTimezone: string,
  now: DateTime.DateTime
): { readonly dueDay: CareDay | null; readonly status: CareStatus | null } =>
  pipe(
    Option.fromNullishOr(dueAt),
    Option.map((instant) => {
      const dueDay = CareDays.of(DateTime.makeUnsafe(instant), careTimezone)
      return {
        dueDay,
        status: careStatus(dueDay, CareDays.today(careTimezone, now)),
      }
    }),
    Option.getOrElse(() => ({ dueDay: null, status: null }))
  )
