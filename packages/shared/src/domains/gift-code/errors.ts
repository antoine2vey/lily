import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class GiftCodeNotFoundError extends Schema.TaggedError<GiftCodeNotFoundError>()(
  'GiftCodeNotFoundError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Gift code not found',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class GiftCodeExpiredError extends Schema.TaggedError<GiftCodeExpiredError>()(
  'GiftCodeExpiredError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This gift code has expired',
    }),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class GiftCodeExhaustedError extends Schema.TaggedError<GiftCodeExhaustedError>()(
  'GiftCodeExhaustedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This gift code has reached its maximum number of uses',
    }),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class GiftCodeInactiveError extends Schema.TaggedError<GiftCodeInactiveError>()(
  'GiftCodeInactiveError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This gift code is no longer active',
    }),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class GiftCodeAlreadyRedeemedError extends Schema.TaggedError<GiftCodeAlreadyRedeemedError>()(
  'GiftCodeAlreadyRedeemedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You have already redeemed this gift code',
    }),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class GiftCodeDuplicateError extends Schema.TaggedError<GiftCodeDuplicateError>()(
  'GiftCodeDuplicateError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'A gift code with this name already exists',
    }),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class GiftCodeMaxUsagesTooLowError extends Schema.TaggedError<GiftCodeMaxUsagesTooLowError>()(
  'GiftCodeMaxUsagesTooLowError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () =>
        'Max usages cannot be less than the current number of redemptions',
    }),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class GiftCodeExpiryInPastError extends Schema.TaggedError<GiftCodeExpiryInPastError>()(
  'GiftCodeExpiryInPastError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Expiry date must be in the future',
    }),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}
