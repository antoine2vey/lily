import { DEFAULT_TIMEZONE, KnownTimezone } from '@lily/shared'
import { Option, pipe, Schema } from 'effect'

/** Resolve a nullable user timezone setting to an IANA string. */
export const resolveTimezone = (tz: string | null): string =>
  Option.getOrElse(Option.fromNullishOr(tz), () => DEFAULT_TIMEZONE)

/**
 * The `timezone` field to store for a device that signs in. Empty when the
 * device reports no zone or one this runtime cannot resolve, so the account
 * keeps the column default.
 */
export const deviceTimezone = (
  reported: string | undefined
): { readonly timezone?: string } =>
  pipe(
    Option.fromUndefinedOr(reported),
    Option.filter(Schema.is(KnownTimezone)),
    Option.match({
      onNone: () => ({}),
      onSome: (timezone) => ({ timezone }),
    })
  )
