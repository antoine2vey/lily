import { Schema } from 'effect'

export class VacationDateError extends Schema.TaggedError<VacationDateError>()(
  'VacationDateError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export class VacationNotFoundError extends Schema.TaggedError<VacationNotFoundError>()(
  'VacationNotFoundError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'No vacation is scheduled or active',
    }),
  },
  { httpApiStatus: 404 }
) {}
