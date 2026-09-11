import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class CarePlanNotFoundError extends Schema.TaggedError<CarePlanNotFoundError>()(
  'CarePlanNotFoundError',
  {
    planId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class CarePlanStepNotFoundError extends Schema.TaggedError<CarePlanStepNotFoundError>()(
  'CarePlanStepNotFoundError',
  {
    stepId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

/** Raised when accepting or dismissing a plan that is no longer `proposed`. */
export class CarePlanNotProposedError extends Schema.TaggedError<CarePlanNotProposedError>()(
  'CarePlanNotProposedError',
  {
    planId: Schema.String,
    status: Schema.String,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}
