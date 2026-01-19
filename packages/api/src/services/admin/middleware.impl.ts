import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { JWTService, JWTServiceLive } from '@lily/api/services/jwt/service'
import type { UserProfile } from '@lily/shared/auth'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Effect, Layer, Redacted } from 'effect'
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
          const tokenValue = Redacted.value(token)

          // Verify JWT token
          const payload = yield* Effect.catchAll(
            jwtService.verifyAccessToken(tokenValue),
            (error) =>
              Effect.fail(
                new ForbiddenError({
                  message: error.message,
                })
              )
          )

          // Check user status from JWT payload first
          if (payload.status !== 'active') {
            return yield* Effect.fail(
              new ForbiddenError({
                message: `Account is ${payload.status}`,
              })
            )
          }

          // Verify admin role from JWT payload
          if (payload.role !== 'admin') {
            return yield* Effect.fail(
              new ForbiddenError({ message: 'Admin access required' })
            )
          }

          // Fetch fresh user data from DB
          const user = yield* Effect.catchAll(
            userRepo.findById(payload.sub),
            () => Effect.fail(new ForbiddenError({ message: 'User not found' }))
          )

          if (!user) {
            return yield* Effect.fail(
              new ForbiddenError({ message: 'User not found' })
            )
          }

          // Double-check user status and role from DB
          if (user.status !== 'active') {
            return yield* Effect.fail(
              new ForbiddenError({
                message: `Account is ${user.status}`,
              })
            )
          }

          if (user.role !== 'admin') {
            return yield* Effect.fail(
              new ForbiddenError({ message: 'Admin access required' })
            )
          }

          // Return user profile for AdminUser context
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
 * AdminAuth middleware with all dependencies bundled
 * Use this in handler files
 */
export const AdminAuthLive = AdminAuthBase.pipe(
  Layer.provide(JWTServiceLive),
  Layer.provide(UserRepositoryLive)
)
