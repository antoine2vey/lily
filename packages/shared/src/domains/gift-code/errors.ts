import { Effect, Schema } from 'effect'

export class GiftCodeNotFoundError extends Schema.TaggedError<
  GiftCodeNotFoundError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeNotFoundError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('Gift code not found')),
      Schema.withConstructorDefault(Effect.succeed('Gift code not found'))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class GiftCodeExpiredError extends Schema.TaggedError<
  GiftCodeExpiredError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeExpiredError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('This gift code has expired')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('This gift code has expired')
      )
    ),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeExhaustedError extends Schema.TaggedError<
  GiftCodeExhaustedError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeExhaustedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('This gift code has reached its maximum number of uses')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('This gift code has reached its maximum number of uses')
      )
    ),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeInactiveError extends Schema.TaggedError<
  GiftCodeInactiveError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeInactiveError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('This gift code is no longer active')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('This gift code is no longer active')
      )
    ),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeAlreadyRedeemedError extends Schema.TaggedError<
  GiftCodeAlreadyRedeemedError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeAlreadyRedeemedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('You have already redeemed this gift code')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('You have already redeemed this gift code')
      )
    ),
  },
  { httpApiStatus: 409 }
) {}

export class GiftCodeDuplicateError extends Schema.TaggedError<
  GiftCodeDuplicateError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeDuplicateError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('A gift code with this name already exists')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('A gift code with this name already exists')
      )
    ),
  },
  { httpApiStatus: 409 }
) {}

export class GiftCodeMaxUsagesTooLowError extends Schema.TaggedError<
  GiftCodeMaxUsagesTooLowError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeMaxUsagesTooLowError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed(
          'Max usages cannot be less than the current number of redemptions'
        )
      ),
      Schema.withConstructorDefault(
        Effect.succeed(
          'Max usages cannot be less than the current number of redemptions'
        )
      )
    ),
  },
  { httpApiStatus: 400 }
) {}

export class GiftCodeExpiryInPastError extends Schema.TaggedError<
  GiftCodeExpiryInPastError,
  { readonly brand: unique symbol }
>()(
  'GiftCodeExpiryInPastError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('Expiry date must be in the future')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('Expiry date must be in the future')
      )
    ),
  },
  { httpApiStatus: 400 }
) {}
