import { Effect, Schema } from 'effect'

export class UserNotPublicError extends Schema.TaggedError<
  UserNotPublicError,
  { readonly brand: unique symbol }
>()(
  'UserNotPublicError',
  {
    userId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 403 }
) {}

export class AlreadyFollowingError extends Schema.TaggedError<
  AlreadyFollowingError,
  { readonly brand: unique symbol }
>()(
  'AlreadyFollowingError',
  {
    targetUserId: Schema.String,
  },
  { httpApiStatus: 409 }
) {}

export class NotFollowingError extends Schema.TaggedError<
  NotFollowingError,
  { readonly brand: unique symbol }
>()(
  'NotFollowingError',
  {
    targetUserId: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export class CannotFollowSelfError extends Schema.TaggedError<
  CannotFollowSelfError,
  { readonly brand: unique symbol }
>()('CannotFollowSelfError', {}, { httpApiStatus: 400 }) {}

export class NudgeRateLimitError extends Schema.TaggedError<
  NudgeRateLimitError,
  { readonly brand: unique symbol }
>()(
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

export class NudgeNotAllowedError extends Schema.TaggedError<
  NudgeNotAllowedError,
  { readonly brand: unique symbol }
>()(
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
