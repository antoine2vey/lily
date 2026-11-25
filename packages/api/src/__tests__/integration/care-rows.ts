import {
  type CareDay,
  CareDays,
  DEFAULT_ZONE,
  type ZoneName,
} from '@lily/shared'
import { DateTime } from 'effect'

export const careDayOf = (
  instant: Date,
  timezone: ZoneName = DEFAULT_ZONE
): CareDay => CareDays.of(DateTime.makeUnsafe(instant), timezone)
