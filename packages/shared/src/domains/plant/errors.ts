import { Schema } from 'effect'

export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  {
    plantId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  { httpApiStatus: 404 }
) {}

export class FutureDateNotAllowedError extends Schema.TaggedError<FutureDateNotAllowedError>()(
  'FutureDateNotAllowedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Care date cannot be in the future',
    }),
  },
  { httpApiStatus: 400 }
) {}

export class AlreadyCaredTodayError extends Schema.TaggedError<AlreadyCaredTodayError>()(
  'AlreadyCaredTodayError',
  {
    careType: Schema.String,
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This care action was already logged today',
    }),
  },
  { httpApiStatus: 409 }
) {}

export class PlantNotAuthorizedError extends Schema.TaggedError<PlantNotAuthorizedError>()(
  'PlantNotAuthorizedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () =>
        'You are not authorized to perform this action on this plant',
    }),
  },
  { httpApiStatus: 403 }
) {}

export class PlantAlreadyDeadError extends Schema.TaggedError<PlantAlreadyDeadError>()(
  'PlantAlreadyDeadError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This plant is already in the cemetery',
    }),
  },
  { httpApiStatus: 409 }
) {}

export class PlantNotDeadError extends Schema.TaggedError<PlantNotDeadError>()(
  'PlantNotDeadError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'This plant is not in the cemetery',
    }),
  },
  { httpApiStatus: 409 }
) {}
