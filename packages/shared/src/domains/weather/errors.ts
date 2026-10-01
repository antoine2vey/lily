import { Schema } from 'effect'

export class WeatherFetchError extends Schema.TaggedError<WeatherFetchError>()(
  'WeatherFetchError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 502 }
) {}

export class WeatherNotAvailableError extends Schema.TaggedError<WeatherNotAvailableError>()(
  'WeatherNotAvailableError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'User has no location configured for weather',
    }),
  },
  { httpApiStatus: 404 }
) {}
