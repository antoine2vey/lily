import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { validateUserFromToken } from '@lily/api/services/auth/user-validator'
import { JWTService, JWTServiceLive } from '@lily/api/services/jwt/service'
import { UnauthorizedError } from '@lily/shared'
import { Array, Cause, Effect, Layer, Option, pipe, Result } from 'effect'
import { isSqlError, type SqlError } from 'effect/sql/SqlError'
import { Authentication, CurrentUser } from './middleware.types'

// Re-export types for convenience
export { Authentication, CurrentUser } from './middleware.types'

const sqlDefectOf = <E>(
  cause: Cause.Cause<E>
): Result.Result<SqlError, Cause.Cause<E>> =>
  pipe(
    cause.reasons,
    Array.findFirst((reason) =>
      Cause.isDieReason(reason) && isSqlError(reason.defect)
        ? Option.some(reason.defect)
        : Option.none()
    ),
    Result.fromOption(() => cause)
  )

const answeringForAnAccountGone =
  (users: UserRepository['Service'], userId: string) =>
  <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | UnauthorizedError, R> =>
    Effect.catchCauseFilter(handler, sqlDefectOf<E>, (_, died) =>
      Effect.gen(function* () {
        const account = yield* Effect.catchTag(
          users.findById(userId),
          'SqlError',
          () => Effect.failCause(died)
        )
        if (account !== null) return yield* Effect.failCause(died)
        yield* Effect.logError(
          'Request died on a database error after its account was deleted',
          died
        ).pipe(Effect.annotateLogs('user.id', userId))
        return yield* new UnauthorizedError({
          message: 'Authentication failed',
        })
      })
    )

/**
 * Base layer for Authentication middleware (requires JWTService and UserRepository)
 */
export const AuthenticationBase = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const jwtService = yield* JWTService
    const userRepo = yield* UserRepository

    return Authentication.of({
      bearer: Effect.fn('auth.validateToken')(function* (
        httpEffect,
        { credential }
      ) {
        const { profile } = yield* validateUserFromToken({
          token: credential,
          createError: (message) => new UnauthorizedError({ message }),
        }).pipe(
          Effect.provideService(JWTService, jwtService),
          Effect.provideService(UserRepository, userRepo),
          Effect.catchTag('JWTError', (e) =>
            Effect.fail(new UnauthorizedError({ message: e.message }))
          )
        )

        return yield* Effect.provideService(
          httpEffect,
          CurrentUser,
          profile
        ).pipe(answeringForAnAccountGone(userRepo, profile.id))
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
