import { type CareDay, CareDays, type ZoneName } from '@lily/shared'
import type { DateTime } from 'effect'

/** The calendar day after the day of `now` in `timezone`, as a date id. */
export const tomorrowId = (
  timezone: ZoneName,
  now: DateTime.DateTime
): CareDay => CareDays.addDays(CareDays.today(timezone, now), 1)
