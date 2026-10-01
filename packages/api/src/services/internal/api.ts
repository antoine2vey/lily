import { ServiceAuthentication } from '@lily/api/services/internal/middleware'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import { AuthResponse } from '@lily/shared/auth'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const AuthError = Schema.Struct({ message: Schema.String })

/**
 * Service token request — validates a magic link code and issues a JWT.
 */
export const ServiceTokenRequest = Schema.Struct({
  magicLinkCode: Schema.String,
})

export type ServiceTokenRequest = typeof ServiceTokenRequest.Type

/**
 * Internal magic link request — send a magic link with a custom callback URL.
 */
export const InternalMagicLinkRequest = Schema.Struct({
  email: Schema.String,
  callbackUrl: Schema.String.check(
    Schema.makeFilter(
      (url) => {
        try {
          const parsed = new URL(url)
          return parsed.protocol === 'https:' || parsed.protocol === 'http:'
        } catch {
          return false
        }
      },
      { message: 'callbackUrl must be a valid HTTP(S) URL' }
    )
  ),
  language: Schema.optional(Schema.Literals(['en', 'fr'])),
})

export type InternalMagicLinkRequest = typeof InternalMagicLinkRequest.Type

/**
 * Internal API group — service-to-service endpoints protected by X-Service-Secret.
 *
 * These endpoints are NOT accessible to regular users. They are called by
 * the MCP server (or other internal services) using a shared secret.
 */
export const InternalApi = HttpApiGroup.make('internal')
  .add(
    HttpApiEndpoint.post('issueServiceToken', '/service-token', {
      payload: ServiceTokenRequest,
      success: AuthResponse,
      error: AuthError.pipe(HttpApiSchema.status(400)),
    })
  )
  .add(
    HttpApiEndpoint.post('sendMagicLink', '/magic-link', {
      payload: InternalMagicLinkRequest,
      success: Schema.Struct({ message: Schema.String }),
      error: [
        AuthError.pipe(HttpApiSchema.status(400)),
        RateLimitExceededError,
      ],
    })
  )
  .prefix('/internal')
  .middleware(ServiceAuthentication)
