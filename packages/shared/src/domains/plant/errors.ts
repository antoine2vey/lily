import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  {
    plantId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class PlantNotAuthorizedError extends Schema.TaggedError<PlantNotAuthorizedError>()(
  'PlantNotAuthorizedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () =>
        'You are not authorized to perform this action on this plant',
    }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}
