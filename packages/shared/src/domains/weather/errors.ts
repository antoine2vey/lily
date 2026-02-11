import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class WeatherFetchError extends Schema.TaggedError<WeatherFetchError>()(
  'WeatherFetchError',
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 502 })
) {}

export class WeatherNotAvailableError extends Schema.TaggedError<WeatherNotAvailableError>()(
  'WeatherNotAvailableError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'User has no location configured for weather',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}
