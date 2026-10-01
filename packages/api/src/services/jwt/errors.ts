import { Effect, Schema } from 'effect'

export class JWTError extends Schema.TaggedError<JWTError>()(
  'JWTError',
  {
    message: Schema.String,
    code: Schema.Literals([
      'INVALID_TOKEN',
      'EXPIRED_TOKEN',
      'MISSING_SECRET',
    ]).pipe(
      Schema.withDecodingDefaultType(Effect.succeed('INVALID_TOKEN' as const)),
      Schema.withConstructorDefault(Effect.succeed('INVALID_TOKEN' as const))
    ),
  },
  { httpApiStatus: 401 }
) {}
