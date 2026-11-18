import { Effect, Schema } from 'effect'

export class DelegationNotFoundError extends Schema.TaggedError<
  DelegationNotFoundError,
  { readonly brand: unique symbol }
>()(
  'DelegationNotFoundError',
  {
    delegationId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class DelegationNotAuthorizedError extends Schema.TaggedError<
  DelegationNotAuthorizedError,
  { readonly brand: unique symbol }
>()(
  'DelegationNotAuthorizedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('You are not authorized to perform this action')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('You are not authorized to perform this action')
      )
    ),
  },
  { httpApiStatus: 403 }
) {}

export class DelegationInvalidStatusError extends Schema.TaggedError<
  DelegationInvalidStatusError,
  { readonly brand: unique symbol }
>()(
  'DelegationInvalidStatusError',
  {
    currentStatus: Schema.String,
    expectedStatus: Schema.String,
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed(
          'Delegation is not in the correct status for this action'
        )
      ),
      Schema.withConstructorDefault(
        Effect.succeed(
          'Delegation is not in the correct status for this action'
        )
      )
    ),
  },
  { httpApiStatus: 409 }
) {}

export class DelegationOverlapError extends Schema.TaggedError<
  DelegationOverlapError,
  { readonly brand: unique symbol }
>()(
  'DelegationOverlapError',
  {
    plantIds: Schema.Array(Schema.String),
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed(
          'Some plants already have an active or accepted delegation for this period'
        )
      ),
      Schema.withConstructorDefault(
        Effect.succeed(
          'Some plants already have an active or accepted delegation for this period'
        )
      )
    ),
  },
  { httpApiStatus: 409 }
) {}

export class DelegationDateError extends Schema.TaggedError<
  DelegationDateError,
  { readonly brand: unique symbol }
>()(
  'DelegationDateError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export class CannotDelegateSelfError extends Schema.TaggedError<
  CannotDelegateSelfError,
  { readonly brand: unique symbol }
>()('CannotDelegateSelfError', {}, { httpApiStatus: 400 }) {}
