import { Schema } from 'effect'

export class UserNotFoundError extends Schema.Class<UserNotFoundError>(
  'UserNotFoundError'
)({}) {}
