import { Effect, Schema } from 'effect'

export class UserNotFoundError extends Schema.TaggedError<
  UserNotFoundError,
  { readonly brand: unique symbol }
>()(
  'UserNotFoundError',
  {
    userId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class SessionNotFoundError extends Schema.TaggedError<
  SessionNotFoundError,
  { readonly brand: unique symbol }
>()(
  'SessionNotFoundError',
  {
    sessionId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 401 }
) {}

export class UnauthorizedError extends Schema.TaggedError<
  UnauthorizedError,
  { readonly brand: unique symbol }
>()(
  'UnauthorizedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('Unauthorized')),
      Schema.withConstructorDefault(Effect.succeed('Unauthorized'))
    ),
  },
  { httpApiStatus: 401 }
) {}
