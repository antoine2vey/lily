import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { JWTService, JWTServiceLive } from '@lily/api/services/jwt/service'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Layer, Redacted } from 'effect'
import { Authentication, Unauthorized } from './middleware.types'

// Re-export types for convenience
export { Authentication, CurrentUser, Unauthorized } from './middleware.types'

/**
 * Base layer for Authentication middleware (requires JWTService and UserRepository)
 */
const AuthenticationBase = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const jwtService = yield* JWTService
    const userRepo = yield* UserRepository

    return Authentication.of({
      bearer: (token) =>
        Effect.gen(function* () {
          yield* Effect.log('[Auth] Bearer token middleware called')
          const tokenValue = Redacted.value(token)

          // Verify JWT token
          yield* Effect.log('[Auth] Verifying JWT token...')
          const payload = yield* Effect.catchAll(
            jwtService.verifyAccessToken(tokenValue),
            (error) => {
              Effect.log('[Auth] JWT verification failed:', error.message)
              return Effect.fail(
                new Unauthorized({
                  message: error.message,
                })
              )
            }
          )
          yield* Effect.log('[Auth] JWT payload:', payload)

          // Check user status from JWT payload first
          if (payload.status !== 'active') {
            yield* Effect.log('[Auth] User status not active:', payload.status)
            return yield* Effect.fail(
              new Unauthorized({
                message: `Account is ${payload.status}`,
              })
            )
          }

          // Optionally fetch fresh user data from DB for critical operations
          // For now, we trust the JWT payload but fetch user for full profile
          yield* Effect.log('[Auth] Fetching user from DB:', payload.sub)
          const user = yield* Effect.catchAll(
            userRepo.findById(payload.sub),
            (error) => {
              Effect.log('[Auth] Database error fetching user:', error)
              return Effect.fail(
                new Unauthorized({ message: 'Database error' })
              )
            }
          )
          yield* Effect.log('[Auth] User from DB:', user)

          if (!user) {
            yield* Effect.log('[Auth] User not found in DB')
            return yield* Effect.fail(
              new Unauthorized({ message: 'User not found' })
            )
          }

          // Double-check user status from DB (in case it changed after token was issued)
          if (user.status !== 'active') {
            yield* Effect.log(
              '[Auth] User status in DB not active:',
              user.status
            )
            return yield* Effect.fail(
              new Unauthorized({
                message: `Account is ${user.status}`,
              })
            )
          }

          // Return user profile for CurrentUser context
          const profile = {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.name || undefined,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            role: user.role,
            status: user.status,
          } as UserProfile
          yield* Effect.log('[Auth] Returning user profile:', profile)
          return profile
        }),
    })
  })
)

/**
 * Authentication middleware with all dependencies bundled
 * Use this in handler files instead of AuthenticationBase
 */
export const AuthenticationLive = AuthenticationBase.pipe(
  Layer.provide(JWTServiceLive),
  Layer.provide(UserRepositoryLive)
)
