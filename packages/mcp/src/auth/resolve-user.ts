import { HttpServerRequest } from '@effect/platform'
import { CurrentJwt } from '@lily/mcp/api-client'
import { OAuthError, OAuthService } from '@lily/mcp/auth/oauth-service'
import { Effect, String as EffectString, pipe } from 'effect'

/**
 * Resolves the API JWT from the bearer token in the request.
 *
 * Extracts the bearer token from the Authorization header, validates it
 * via OAuthService, and returns the raw JWT string.
 *
 * HttpServerRequest is accessed from the ambient fiber context — always
 * present inside @effect/platform's HTTP server request-handling fiber.
 */
export const resolveApiJwt = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const oauthService = yield* OAuthService

  const authHeader = request.headers.authorization
  if (!authHeader || !pipe(authHeader, EffectString.startsWith('Bearer '))) {
    return yield* new OAuthError({
      error: 'invalid_token',
      error_description: 'Authentication required',
    })
  }

  const token = pipe(authHeader, EffectString.slice(7))
  const validation = yield* oauthService.validateBearerToken(token)

  if (!validation.apiJwt) {
    return yield* new OAuthError({
      error: 'invalid_token',
      error_description: 'API JWT not found in access token',
    })
  }

  return validation.apiJwt
}).pipe(
  Effect.catchTag(
    'SqlError',
    () =>
      new OAuthError({
        error: 'server_error',
        error_description: 'Authentication failed',
      })
  ),
  Effect.withSpan('MCP.resolveApiJwt')
)

/**
 * Pipe operator that resolves the bearer token from the current HTTP
 * request and provides the API JWT into context as CurrentJwt.
 *
 * Usage:
 *   effect.pipe(provideAuth, Effect.provide(ctx))
 *
 * HttpServerRequest is ambient (provided per-request by the HTTP server
 * framework) and intentionally excluded from the return type.
 */
export const provideAuth = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E | OAuthError, Exclude<R, CurrentJwt> | OAuthService> =>
  Effect.provideServiceEffect(self, CurrentJwt, resolveApiJwt) as Effect.Effect<
    A,
    E | OAuthError,
    Exclude<R, CurrentJwt> | OAuthService
  >
