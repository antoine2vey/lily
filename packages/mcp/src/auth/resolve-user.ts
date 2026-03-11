import { HttpServerRequest } from '@effect/platform'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { OAuthService } from '@lily/mcp/auth/oauth-service'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, String as EffectString, Option, pipe } from 'effect'

/**
 * Resolves the authenticated user from the bearer token in the HTTP request.
 *
 * Single source of truth for MCP auth resolution: extracts the bearer token
 * from the Authorization header, validates it via OAuthService, fetches the
 * user from the database, and builds a UserProfile.
 *
 * HttpServerRequest is accessed from the ambient fiber context — always present
 * inside @effect/platform's HTTP server request-handling fiber. The type
 * assertion removes it from R since it cannot propagate through layer
 * composition but is guaranteed at runtime.
 */
export const resolveAuthFromRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const oauthService = yield* OAuthService
  const userRepo = yield* UserRepository

  const authHeader = request.headers.authorization
  if (!authHeader || !pipe(authHeader, EffectString.startsWith('Bearer '))) {
    return yield* Effect.die(new Error('Authentication required'))
  }

  const token = pipe(authHeader, EffectString.slice(7))
  const validation = yield* oauthService.validateBearerToken(token)

  const user = yield* userRepo.findById(validation.userId)
  if (!user) {
    return yield* Effect.die(new Error('Authentication required'))
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: Option.getOrUndefined(Option.fromNullable(user.name)),
    timezone: Option.getOrUndefined(Option.fromNullable(user.timezone)),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: user.role,
    status: user.status,
  } satisfies UserProfile
}).pipe(
  Effect.orDie,
  Effect.withSpan('MCP.resolveAuthFromRequest')
) as Effect.Effect<UserProfile, never, OAuthService | UserRepository>
