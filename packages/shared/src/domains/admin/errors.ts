import { Effect, Schema } from 'effect'

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  'ForbiddenError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('Access forbidden - admin role required')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('Access forbidden - admin role required')
      )
    ),
  },
  { httpApiStatus: 403 }
) {}

export class CannotModifySelfError extends Schema.TaggedError<CannotModifySelfError>()(
  'CannotModifySelfError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('Cannot modify your own role or status')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('Cannot modify your own role or status')
      )
    ),
  },
  { httpApiStatus: 400 }
) {}

export class ChatMessageNotFoundError extends Schema.TaggedError<ChatMessageNotFoundError>()(
  'ChatMessageNotFoundError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('Chat message not found')),
      Schema.withConstructorDefault(Effect.succeed('Chat message not found'))
    ),
  },
  { httpApiStatus: 404 }
) {}

// Raised when an admin gift/revoke would overwrite a real store-billed
// (App Store / Play Store) subscription. Server-side backstop for the same
// rule the admin UI enforces by disabling the controls.
export class StorePayerProtectedError extends Schema.TaggedError<StorePayerProtectedError>()(
  'StorePayerProtectedError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed(
          'User has an active store-billed subscription; gifting or revoking would overwrite it'
        )
      ),
      Schema.withConstructorDefault(
        Effect.succeed(
          'User has an active store-billed subscription; gifting or revoking would overwrite it'
        )
      )
    ),
  },
  { httpApiStatus: 409 }
) {}
