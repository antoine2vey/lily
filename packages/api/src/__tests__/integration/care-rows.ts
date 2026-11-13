import { type CareDay, CareDays } from '@lily/shared'
import { DateTime } from 'effect'

export const careDayOf = (instant: Date, timezone = 'UTC'): CareDay =>
  CareDays.of(DateTime.makeUnsafe(instant), timezone)
