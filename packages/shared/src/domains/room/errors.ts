import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class RoomNotFoundError extends Schema.TaggedError<RoomNotFoundError>()(
  'RoomNotFoundError',
  {
    roomId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}
