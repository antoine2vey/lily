import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { validateUserFromToken } from '@lily/api/services/auth/user-validator'
import { JWTService, JWTServiceLive } from '@lily/api/services/jwt/service'
import { UnauthorizedError } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { Authentication } from './middleware.types'

// Re-export types for convenience
export { Authentication, CurrentUser } from './middleware.types'

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
          const { profile } = yield* Effect.catchAll(
            validateUserFromToken({
              token,
              createError: (message) => new UnauthorizedError({ message }),
            }).pipe(
              Effect.provideService(JWTService, jwtService),
              Effect.provideService(UserRepository, userRepo)
            ),
            (error) =>
              Effect.fail(
                new UnauthorizedError({
                  message: 'message' in error ? error.message : 'Invalid token',
                })
              )
          )

          return profile
        }).pipe(Effect.withSpan('auth.validateToken')),
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
