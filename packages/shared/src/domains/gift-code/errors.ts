import { Schema } from 'effect'

export class GiftCodeNotFoundError extends Schema.TaggedError<GiftCodeNotFoundError>()(
  'GiftCodeNotFoundError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Gift code not found',
    }),
  },
  { httpApiStatus: 404 }
) {}

export class GiftCodeExpiredError extends Schema.TaggedError<GiftCodeExpiredError>()(
  'GiftCodeExpiredError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This gift code has expired',
    }),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeExhaustedError extends Schema.TaggedError<GiftCodeExhaustedError>()(
  'GiftCodeExhaustedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This gift code has reached its maximum number of uses',
    }),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeInactiveError extends Schema.TaggedError<GiftCodeInactiveError>()(
  'GiftCodeInactiveError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This gift code is no longer active',
    }),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeAlreadyRedeemedError extends Schema.TaggedError<GiftCodeAlreadyRedeemedError>()(
  'GiftCodeAlreadyRedeemedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You have already redeemed this gift code',
    }),
  },
  { httpApiStatus: 409 }
) {}

export class GiftCodeDuplicateError extends Schema.TaggedError<GiftCodeDuplicateError>()(
  'GiftCodeDuplicateError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'A gift code with this name already exists',
    }),
  },
  { httpApiStatus: 409 }
) {}

export class GiftCodeMaxUsagesTooLowError extends Schema.TaggedError<GiftCodeMaxUsagesTooLowError>()(
  'GiftCodeMaxUsagesTooLowError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () =>
        'Max usages cannot be less than the current number of redemptions',
    }),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeExpiryInPastError extends Schema.TaggedError<GiftCodeExpiryInPastError>()(
  'GiftCodeExpiryInPastError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Expiry date must be in the future',
    }),
  },
  { httpApiStatus: 400 }
) {}
