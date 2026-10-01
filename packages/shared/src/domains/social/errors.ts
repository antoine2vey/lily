import { Effect, Schema } from 'effect'

export class UserNotPublicError extends Schema.TaggedError<UserNotPublicError>()(
  'UserNotPublicError',
  {
    userId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 403 }
) {}

export class AlreadyFollowingError extends Schema.TaggedError<AlreadyFollowingError>()(
  'AlreadyFollowingError',
  {
    targetUserId: Schema.String,
  },
  { httpApiStatus: 409 }
) {}

export class NotFollowingError extends Schema.TaggedError<NotFollowingError>()(
  'NotFollowingError',
  {
    targetUserId: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export class CannotFollowSelfError extends Schema.TaggedError<CannotFollowSelfError>()(
  'CannotFollowSelfError',
  {},
  { httpApiStatus: 400 }
) {}

export class NudgeRateLimitError extends Schema.TaggedError<NudgeRateLimitError>()(
  'NudgeRateLimitError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('You can only nudge this user once per day')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('You can only nudge this user once per day')
      )
    ),
  },
  { httpApiStatus: 429 }
) {}

export class NudgeNotAllowedError extends Schema.TaggedError<NudgeNotAllowedError>()(
  'NudgeNotAllowedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('You can only nudge users you follow')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('You can only nudge users you follow')
      )
    ),
  },
  { httpApiStatus: 403 }
) {}
