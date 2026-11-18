import { Effect, Schema } from 'effect'

export class WeatherFetchError extends Schema.TaggedError<
  WeatherFetchError,
  { readonly brand: unique symbol }
>()(
  'WeatherFetchError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 502 }
) {}

export class WeatherNotAvailableError extends Schema.TaggedError<
  WeatherNotAvailableError,
  { readonly brand: unique symbol }
>()(
  'WeatherNotAvailableError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('User has no location configured for weather')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('User has no location configured for weather')
      )
    ),
  },
  { httpApiStatus: 404 }
) {}
