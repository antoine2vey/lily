import { Effect, Schema } from 'effect'

export class RoomNotFoundError extends Schema.TaggedError<
  RoomNotFoundError,
  { readonly brand: unique symbol }
>()(
  'RoomNotFoundError',
  {
    roomId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}
