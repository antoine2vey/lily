import { Effect, Schema } from 'effect'

export class CarePlanNotFoundError extends Schema.TaggedError<
  CarePlanNotFoundError,
  { readonly brand: unique symbol }
>()(
  'CarePlanNotFoundError',
  {
    planId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class CarePlanStepNotFoundError extends Schema.TaggedError<
  CarePlanStepNotFoundError,
  { readonly brand: unique symbol }
>()(
  'CarePlanStepNotFoundError',
  {
    stepId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class CarePlanNotAuthorizedError extends Schema.TaggedError<
  CarePlanNotAuthorizedError,
  { readonly brand: unique symbol }
>()(
  'CarePlanNotAuthorizedError',
  {
    planId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 403 }
) {}

/** Raised when accepting or dismissing a plan that is no longer `proposed`. */
export class CarePlanNotProposedError extends Schema.TaggedError<
  CarePlanNotProposedError,
  { readonly brand: unique symbol }
>()(
  'CarePlanNotProposedError',
  {
    planId: Schema.String,
    status: Schema.String,
  },
  { httpApiStatus: 409 }
) {}
