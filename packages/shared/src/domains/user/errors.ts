import { Schema } from 'effect'

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  'UserNotFoundError',
  {
    userId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  { httpApiStatus: 404 }
) {}

export class SessionNotFoundError extends Schema.TaggedError<SessionNotFoundError>()(
  'SessionNotFoundError',
  {
    sessionId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  { httpApiStatus: 401 }
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  'UnauthorizedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Unauthorized',
    }),
  },
  { httpApiStatus: 401 }
) {}
