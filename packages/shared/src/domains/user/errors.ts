import { Schema } from 'effect'

export class UserNotFoundError extends Schema.Class<UserNotFoundError>(
  'UserNotFoundError'
)({}) {}

export class SessionNotFoundError extends Schema.Class<SessionNotFoundError>(
  'SessionNotFoundError'
)({}) {}
