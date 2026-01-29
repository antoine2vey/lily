import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class DeviceTokenNotFoundError extends Schema.TaggedError<DeviceTokenNotFoundError>()(
  'DeviceTokenNotFoundError',
  {
    token: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}
