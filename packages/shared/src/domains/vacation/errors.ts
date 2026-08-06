import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class VacationDateError extends Schema.TaggedError<VacationDateError>()(
  'VacationDateError',
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class VacationNotFoundError extends Schema.TaggedError<VacationNotFoundError>()(
  'VacationNotFoundError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'No vacation is scheduled or active',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}
