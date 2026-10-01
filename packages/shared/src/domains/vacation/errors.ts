import { Effect, Schema } from 'effect'

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
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('No vacation is scheduled or active')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('No vacation is scheduled or active')
      )
    ),
  },
  { httpApiStatus: 404 }
) {}
