import { type CareDay, CareDays, type ZoneName } from '@lily/shared'
import { DateTime } from 'effect'

export const careDayOf = (instant: Date, timezone: ZoneName | null): CareDay =>
  CareDays.of(DateTime.makeUnsafe(instant), timezone ?? 'UTC')
