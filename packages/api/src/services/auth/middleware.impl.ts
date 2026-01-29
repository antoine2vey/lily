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
          const tokenValue = Redacted.value(token)

          // Verify JWT token
          const payload = yield* Effect.catchAll(
            jwtService.verifyAccessToken(tokenValue),
            (error) =>
              Effect.fail(
                new Unauthorized({
                  message: error.message,
                })
              )
          )

          // Check user status from JWT payload first
          if (payload.status !== 'active') {
            return yield* Effect.fail(
              new Unauthorized({
                message: `Account is ${payload.status}`,
              })
            )
          }

          // Optionally fetch fresh user data from DB for critical operations
          // For now, we trust the JWT payload but fetch user for full profile
          const user = yield* Effect.catchAll(
            userRepo.findById(payload.sub),
            () => Effect.fail(new Unauthorized({ message: 'Database error' }))
          )

          if (!user) {
            return yield* Effect.fail(
              new Unauthorized({ message: 'User not found' })
            )
          }

          // Double-check user status from DB (in case it changed after token was issued)
          if (user.status !== 'active') {
            return yield* Effect.fail(
              new Unauthorized({
                message: `Account is ${user.status}`,
              })
            )
          }

          // Return user profile for CurrentUser context
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.name || undefined,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            role: user.role,
            status: user.status,
          } as UserProfile
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
