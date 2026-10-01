import { Effect, Schema } from 'effect'

export class RoomNotFoundError extends Schema.TaggedError<RoomNotFoundError>()(
  'RoomNotFoundError',
  {
    roomId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}
