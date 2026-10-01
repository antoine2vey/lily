import { Effect, Schema } from 'effect'

export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  {
    plantId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class FutureDateNotAllowedError extends Schema.TaggedError<FutureDateNotAllowedError>()(
  'FutureDateNotAllowedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('Care date cannot be in the future')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('Care date cannot be in the future')
      )
    ),
  },
  { httpApiStatus: 400 }
) {}

export class AlreadyCaredTodayError extends Schema.TaggedError<AlreadyCaredTodayError>()(
  'AlreadyCaredTodayError',
  {
    careType: Schema.String,
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('This care action was already logged today')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('This care action was already logged today')
      )
    ),
  },
  { httpApiStatus: 409 }
) {}

export class PlantNotAuthorizedError extends Schema.TaggedError<PlantNotAuthorizedError>()(
  'PlantNotAuthorizedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed(
          'You are not authorized to perform this action on this plant'
        )
      ),
      Schema.withConstructorDefault(
        Effect.succeed(
          'You are not authorized to perform this action on this plant'
        )
      )
    ),
  },
  { httpApiStatus: 403 }
) {}

export class PlantAlreadyDeadError extends Schema.TaggedError<PlantAlreadyDeadError>()(
  'PlantAlreadyDeadError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('This plant is already in the cemetery')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('This plant is already in the cemetery')
      )
    ),
  },
  { httpApiStatus: 409 }
) {}

export class PlantNotDeadError extends Schema.TaggedError<PlantNotDeadError>()(
  'PlantNotDeadError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('This plant is not in the cemetery')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('This plant is not in the cemetery')
      )
    ),
  },
  { httpApiStatus: 409 }
) {}
