import { HttpApiMiddleware, HttpApiSecurity } from '@effect/platform'
import { UnauthorizedError } from '@lily/shared'
import type { UserProfile } from '@lily/shared/auth'
import { Context } from 'effect'

/**
 * Current authenticated user context provided by auth middleware
 */
export class CurrentUser extends Context.Tag('CurrentUser')<
  CurrentUser,
  UserProfile
>() {}

/**
 * Authentication middleware using Bearer token
 * Validates JWT token and provides CurrentUser context to handlers
 */
export class Authentication extends HttpApiMiddleware.Tag<Authentication>()(
  'Authentication',
  {
    failure: UnauthorizedError,
    provides: CurrentUser,
    security: {
      bearer: HttpApiSecurity.bearer,
    },
  }
) {}
