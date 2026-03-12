import { HttpApiMiddleware, HttpApiSecurity } from '@effect/platform'
import { UnauthorizedError } from '@lily/shared'
import { Context } from 'effect'

/**
 * Marker context tag provided by ServiceAuthentication middleware.
 * Signals that the request has been authenticated via the service secret.
 */
export class ServiceAuth extends Context.Tag('ServiceAuth')<
  ServiceAuth,
  { readonly verified: true }
>() {}

/**
 * Service-to-service authentication middleware.
 *
 * Protects internal endpoints with an API key in the `X-Service-Secret` header.
 * The implementation validates the key against the `SERVICE_TOKEN_SECRET` env var.
 */
export class ServiceAuthentication extends HttpApiMiddleware.Tag<ServiceAuthentication>()(
  'ServiceAuthentication',
  {
    failure: UnauthorizedError,
    provides: ServiceAuth,
    security: {
      apiKey: HttpApiSecurity.apiKey({
        key: 'X-Service-Secret',
        in: 'header',
      }),
    },
  }
) {}
