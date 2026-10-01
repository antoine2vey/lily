import { UnauthorizedError } from '@lily/shared'
import type { UserProfile } from '@lily/shared/auth'
import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

/**
 * Current authenticated user context provided by auth middleware
 */
export class CurrentUser extends Context.Service<CurrentUser, UserProfile>()(
  'CurrentUser'
) {}

/**
 * Authentication middleware using Bearer token
 * Validates JWT token and provides CurrentUser context to handlers
 */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()('Authentication', {
  error: UnauthorizedError,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}
