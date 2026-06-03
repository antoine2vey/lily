import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  'ForbiddenError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Access forbidden - admin role required',
    }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class CannotModifySelfError extends Schema.TaggedError<CannotModifySelfError>()(
  'CannotModifySelfError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Cannot modify your own role or status',
    }),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class ChatMessageNotFoundError extends Schema.TaggedError<ChatMessageNotFoundError>()(
  'ChatMessageNotFoundError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Chat message not found',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

// Raised when an admin gift/revoke would overwrite a real store-billed
// (App Store / Play Store) subscription. Server-side backstop for the same
// rule the admin UI enforces by disabling the controls.
export class StorePayerProtectedError extends Schema.TaggedError<StorePayerProtectedError>()(
  'StorePayerProtectedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () =>
        'User has an active store-billed subscription; gifting or revoking would overwrite it',
    }),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}
