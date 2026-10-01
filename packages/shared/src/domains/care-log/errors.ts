import { Effect, Schema } from 'effect'

export class CareLogNotFoundError extends Schema.TaggedError<CareLogNotFoundError>()(
  'CareLogNotFoundError',
  {
    careLogId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}
