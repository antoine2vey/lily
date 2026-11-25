import {
  type CareDay,
  CareDays,
  DEFAULT_ZONE,
  type ZoneName,
} from '@lily/shared'
import { DateTime } from 'effect'

export const careDayOf = (instant: Date, timezone: ZoneName | null): CareDay =>
  CareDays.of(DateTime.makeUnsafe(instant), timezone ?? DEFAULT_ZONE)
