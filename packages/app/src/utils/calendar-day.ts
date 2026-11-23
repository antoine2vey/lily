import { type CareDay, CareDays } from '@lily/shared'
import type { DateTime } from 'effect'

/** The calendar day after the day of `now` in `timezone`, as a date id. */
export const tomorrowId = (timezone: string, now: DateTime.DateTime): CareDay =>
  CareDays.addDays(CareDays.today(timezone, now), 1)
