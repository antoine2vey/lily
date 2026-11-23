import { ServiceUnavailableError, UnauthorizedError } from '@lily/shared'
import type { UserProfile } from '@lily/shared/auth'
import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

export class CurrentUser extends Context.Service<CurrentUser, UserProfile>()(
  'CurrentUser'
) {}

export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()('Authentication', {
  error: [UnauthorizedError, ServiceUnavailableError],
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}
