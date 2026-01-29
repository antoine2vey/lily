import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { validateUserFromToken } from '@lily/api/services/auth/user-validator'
import { JWTService, JWTServiceLive } from '@lily/api/services/jwt/service'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Effect, Layer } from 'effect'
import { AdminAuth } from './middleware.types'

// Re-export types for convenience
export { AdminAuth, AdminUser } from './middleware.types'

/**
 * Base layer for AdminAuth middleware
 * Validates bearer token and checks admin role in one step
 */
const AdminAuthBase = Layer.effect(
  AdminAuth,
  Effect.gen(function* () {
    const jwtService = yield* JWTService
    const userRepo = yield* UserRepository

    return AdminAuth.of({
      bearer: (token) =>
        Effect.gen(function* () {
          const { profile } = yield* Effect.catchAll(
            validateUserFromToken({
              token,
              createError: (message) => new ForbiddenError({ message }),
              requireAdmin: true,
            }).pipe(
              Effect.provideService(JWTService, jwtService),
              Effect.provideService(UserRepository, userRepo)
            ),
            (error) =>
              Effect.fail(
                new ForbiddenError({
                  message: 'message' in error ? error.message : 'Access denied',
                })
              )
          )

          return profile
        }),
    })
  })
)

/**
 * AdminAuth middleware with all dependencies bundled
 * Use this in handler files
 */
export const AdminAuthLive = AdminAuthBase.pipe(
  Layer.provide(JWTServiceLive),
  Layer.provide(UserRepositoryLive)
)
