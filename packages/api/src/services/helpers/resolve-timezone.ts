import { DEFAULT_TIMEZONE, TimeZone } from '@lily/shared'
import { Option, pipe, Schema } from 'effect'

export const resolveTimezone = (tz: string | null): string =>
  Option.getOrElse(Option.fromNullishOr(tz), () => DEFAULT_TIMEZONE)

/**
 * The `timezone` field to store for a device that signs in, in canonical form.
 * Empty when the device reports no zone or one outside the canonical set and
 * its aliases, so the account keeps the column default.
 */
export const deviceTimezone = (
  reported: string | undefined
): { readonly timezone?: TimeZone } =>
  pipe(
    Option.fromUndefinedOr(reported),
    Option.flatMap(Schema.decodeUnknownOption(TimeZone)),
    Option.match({
      onNone: () => ({}),
      onSome: (timezone) => ({ timezone }),
    })
  )
