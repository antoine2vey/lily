import { Schema } from 'effect'

export class RoomNotFoundError extends Schema.TaggedError<RoomNotFoundError>()(
  'RoomNotFoundError',
  {
    roomId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  { httpApiStatus: 404 }
) {}
