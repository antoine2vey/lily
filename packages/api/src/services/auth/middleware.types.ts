import {
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from '@effect/platform'
import type { UserProfile } from '@lily/shared/auth'
import { Context, Schema } from 'effect'

/**
 * Current authenticated user context provided by auth middleware
 */
export class CurrentUser extends Context.Tag('CurrentUser')<
  CurrentUser,
  UserProfile
>() {}

/**
 * Unauthorized error returned when authentication fails
 */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Unauthorized',
    }),
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

/**
 * Authentication middleware using Bearer token
 * Validates JWT token and provides CurrentUser context to handlers
 */
export class Authentication extends HttpApiMiddleware.Tag<Authentication>()(
  'Authentication',
  {
    failure: Unauthorized,
    provides: CurrentUser,
    security: {
      bearer: HttpApiSecurity.bearer,
    },
  }
) {}
