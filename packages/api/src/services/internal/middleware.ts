import { UnauthorizedError } from '@lily/shared'
import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

/**
 * Marker context tag provided by ServiceAuthentication middleware.
 * Signals that the request has been authenticated via the service secret.
 */
export class ServiceAuth extends Context.Service<
  ServiceAuth,
  { readonly verified: true }
>()('ServiceAuth') {}

export class ServiceAuthentication extends HttpApiMiddleware.Service<
  ServiceAuthentication,
  { provides: ServiceAuth }
>()('ServiceAuthentication', {
  error: UnauthorizedError,
  security: {
    apiKey: HttpApiSecurity.apiKey({
      key: 'X-Service-Secret',
      in: 'header',
    }),
  },
}) {}
