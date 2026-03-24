import type { GiftDuration } from '@lily/shared/admin'
import { DateTime, Match, Option, pipe } from 'effect'

export const durationToDays = (duration: GiftDuration): Option.Option<number> =>
  pipe(
    Match.value(duration),
    Match.when('7d', () => Option.some(7)),
    Match.when('1m', () => Option.some(30)),
    Match.when('1y', () => Option.some(365)),
    Match.when('infinite', () => Option.none()),
    Match.exhaustive
  )

export const INFINITE_END = DateTime.unsafeMake(Date.UTC(2099, 11, 31))

export const computePeriodEnd = (duration: GiftDuration): Date =>
  pipe(
    durationToDays(duration),
    Option.match({
      onNone: () => DateTime.toDate(INFINITE_END),
      onSome: (days) =>
        pipe(DateTime.unsafeNow(), DateTime.add({ days }), DateTime.toDate),
    })
  )
