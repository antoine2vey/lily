import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class UserNotPublicError extends Schema.TaggedError<UserNotPublicError>()(
  'UserNotPublicError',
  {
    userId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class AlreadyFollowingError extends Schema.TaggedError<AlreadyFollowingError>()(
  'AlreadyFollowingError',
  {
    targetUserId: Schema.String,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class NotFollowingError extends Schema.TaggedError<NotFollowingError>()(
  'NotFollowingError',
  {
    targetUserId: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class CannotFollowSelfError extends Schema.TaggedError<CannotFollowSelfError>()(
  'CannotFollowSelfError',
  {},
  HttpApiSchema.annotations({ status: 400 })
) {}

export class NudgeRateLimitError extends Schema.TaggedError<NudgeRateLimitError>()(
  'NudgeRateLimitError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You can only nudge this user once per day',
    }),
  },
  HttpApiSchema.annotations({ status: 429 })
) {}

export class NudgeNotAllowedError extends Schema.TaggedError<NudgeNotAllowedError>()(
  'NudgeNotAllowedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You can only nudge users you follow',
    }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}
