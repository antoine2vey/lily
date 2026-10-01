import { Effect, Schema } from 'effect'

export class DeviceTokenNotFoundError extends Schema.TaggedError<DeviceTokenNotFoundError>()(
  'DeviceTokenNotFoundError',
  {
    token: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}
