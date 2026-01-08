import { Data } from 'effect'

export class NotificationNotFoundError extends Data.TaggedError(
  'NotificationNotFoundError'
) {}
