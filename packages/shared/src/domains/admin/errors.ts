import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  'ForbiddenError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Access forbidden - admin role required',
    }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class CannotModifySelfError extends Schema.TaggedError<CannotModifySelfError>()(
  'CannotModifySelfError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Cannot modify your own role or status',
    }),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}
