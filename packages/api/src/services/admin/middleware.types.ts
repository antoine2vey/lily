import type { UserProfile } from '@lily/shared/auth'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

/**
 * Admin user context - CurrentUser with verified admin role
 */
export class AdminUser extends Context.Service<AdminUser, UserProfile>()(
  'AdminUser'
) {}

/**
 * Admin authorization middleware
 * Validates bearer token AND verifies admin role
 */
export class AdminAuth extends HttpApiMiddleware.Service<
  AdminAuth,
  { provides: AdminUser }
>()('AdminAuth', {
  error: ForbiddenError,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}
