import { DEFAULT_TIMEZONE } from '@lily/shared'
import { Option } from 'effect'

/** Resolve a nullable user timezone setting to an IANA string. */
export const resolveTimezone = (tz: string | null): string =>
  Option.getOrElse(Option.fromNullable(tz), () => DEFAULT_TIMEZONE)
