import { Schema } from 'effect'

export class UserNotFoundError extends Schema.Class<UserNotFoundError>(
  'UserNotFoundError'
)({}) {}

export class SessionNotFoundError extends Schema.Class<SessionNotFoundError>(
  'SessionNotFoundError'
)({}) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  'UnauthorizedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Unauthorized',
    }),
  }
) {}
