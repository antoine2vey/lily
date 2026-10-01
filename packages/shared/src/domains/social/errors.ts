import { Schema } from 'effect'

export class UserNotPublicError extends Schema.TaggedError<UserNotPublicError>()(
  'UserNotPublicError',
  {
    userId: Schema.optionalWith(Schema.String, { default: () => '' }),
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
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You can only nudge this user once per day',
    }),
  },
  { httpApiStatus: 429 }
) {}

export class NudgeNotAllowedError extends Schema.TaggedError<NudgeNotAllowedError>()(
  'NudgeNotAllowedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You can only nudge users you follow',
    }),
  },
  { httpApiStatus: 403 }
) {}
