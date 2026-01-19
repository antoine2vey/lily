import { HttpApiMiddleware, HttpApiSecurity } from '@effect/platform'
import type { UserProfile } from '@lily/shared/auth'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Context } from 'effect'

/**
 * Admin user context - CurrentUser with verified admin role
 */
export class AdminUser extends Context.Tag('AdminUser')<
  AdminUser,
  UserProfile
>() {}

/**
 * Admin authorization middleware
 * Validates bearer token AND verifies admin role
 */
export class AdminAuth extends HttpApiMiddleware.Tag<AdminAuth>()('AdminAuth', {
  failure: ForbiddenError,
  provides: AdminUser,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}
