import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { validateUserFromToken } from '@lily/api/services/auth/user-validator'
import { JWTService, JWTServiceLive } from '@lily/api/services/jwt/service'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Effect, Layer } from 'effect'
import { AdminAuth, AdminUser } from './middleware.types'

export { AdminAuth, AdminUser } from './middleware.types'

export const AdminAuthBase = Layer.effect(
  AdminAuth,
  Effect.gen(function* () {
    const jwtService = yield* JWTService
    const userRepo = yield* UserRepository

    return AdminAuth.of({
      bearer: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const { profile } = yield* validateUserFromToken({
            token: credential,
            createError: (message) => new ForbiddenError({ message }),
            requireAdmin: true,
          }).pipe(
            Effect.provideService(JWTService, jwtService),
            Effect.provideService(UserRepository, userRepo),
            Effect.catchTag('JWTError', (e) =>
              Effect.fail(new ForbiddenError({ message: e.message }))
            )
          )

          return yield* Effect.provideService(httpEffect, AdminUser, profile)
        }),
    })
  })
)

export const AdminAuthLive = AdminAuthBase.pipe(
  Layer.provide(JWTServiceLive),
  Layer.provide(UserRepositoryLive)
)
