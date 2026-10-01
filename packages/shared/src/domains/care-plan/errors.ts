import { Effect, Schema } from 'effect'

export class CarePlanNotFoundError extends Schema.TaggedError<CarePlanNotFoundError>()(
  'CarePlanNotFoundError',
  {
    planId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class CarePlanStepNotFoundError extends Schema.TaggedError<CarePlanStepNotFoundError>()(
  'CarePlanStepNotFoundError',
  {
    stepId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

/** Raised when accepting or dismissing a plan that is no longer `proposed`. */
export class CarePlanNotProposedError extends Schema.TaggedError<CarePlanNotProposedError>()(
  'CarePlanNotProposedError',
  {
    planId: Schema.String,
    status: Schema.String,
  },
  { httpApiStatus: 409 }
) {}
