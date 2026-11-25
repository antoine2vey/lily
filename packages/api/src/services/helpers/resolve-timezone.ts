import { DEFAULT_ZONE, ZoneName } from '@lily/shared'
import { Option, pipe, Schema } from 'effect'

/** The zone of an account, `DEFAULT_ZONE` when it stores none. */
export const resolveTimezone = (tz: ZoneName | null): ZoneName =>
  Option.getOrElse(Option.fromNullishOr(tz), () => DEFAULT_ZONE)

/**
 * The `timezone` field to store for a device that signs in, in canonical form.
 * Empty when the device reports no zone or one outside the canonical set and
 * its aliases, so the account keeps the column default.
 */
export const deviceTimezone = (
  reported: string | undefined
): { readonly timezone?: ZoneName } =>
  pipe(
    Option.fromUndefinedOr(reported),
    Option.flatMap(Schema.decodeUnknownOption(ZoneName)),
    Option.match({
      onNone: () => ({}),
      onSome: (timezone) => ({ timezone }),
    })
  )
