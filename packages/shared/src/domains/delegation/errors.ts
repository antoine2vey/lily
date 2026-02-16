import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class DelegationNotFoundError extends Schema.TaggedError<DelegationNotFoundError>()(
  'DelegationNotFoundError',
  {
    delegationId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class DelegationNotAuthorizedError extends Schema.TaggedError<DelegationNotAuthorizedError>()(
  'DelegationNotAuthorizedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You are not authorized to perform this action',
    }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class DelegationInvalidStatusError extends Schema.TaggedError<DelegationInvalidStatusError>()(
  'DelegationInvalidStatusError',
  {
    currentStatus: Schema.String,
    expectedStatus: Schema.String,
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Delegation is not in the correct status for this action',
    }),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class DelegationOverlapError extends Schema.TaggedError<DelegationOverlapError>()(
  'DelegationOverlapError',
  {
    plantIds: Schema.Array(Schema.String),
    message: Schema.optionalWith(Schema.String, {
      default: () =>
        'Some plants already have an active or accepted delegation for this period',
    }),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class DelegationDateError extends Schema.TaggedError<DelegationDateError>()(
  'DelegationDateError',
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class CannotDelegateSelfError extends Schema.TaggedError<CannotDelegateSelfError>()(
  'CannotDelegateSelfError',
  {},
  HttpApiSchema.annotations({ status: 400 })
) {}
