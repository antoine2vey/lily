import { Effect, Schema } from 'effect'

export class DeviceTokenNotFoundError extends Schema.TaggedError<
  DeviceTokenNotFoundError,
  { readonly brand: unique symbol }
>()(
  'DeviceTokenNotFoundError',
  {
    token: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}
