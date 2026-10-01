import { Schema } from 'effect'

export class JWTError extends Schema.TaggedError<JWTError>()(
  'JWTError',
  {
    message: Schema.String,
    code: Schema.optionalWith(
      Schema.Literals(['INVALID_TOKEN', 'EXPIRED_TOKEN', 'MISSING_SECRET']),
      { default: () => 'INVALID_TOKEN' as const }
    ),
  },
  { httpApiStatus: 401 }
) {}
