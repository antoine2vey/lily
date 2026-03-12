import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { JWTError } from '@lily/api/services/jwt/errors'
import { JWTService } from '@lily/api/services/jwt/service'
import type { users } from '@lily/db/schema'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Option, pipe, Redacted } from 'effect'

export interface ValidatedUserResult {
  user: typeof users.$inferSelect
  profile: UserProfile
}

export interface TokenValidationConfig<E> {
  token: Redacted.Redacted<string>
  createError: (message: string) => E
  requireAdmin?: boolean
}

/**
 * Validates a bearer token and returns the user data.
 * This helper encapsulates the common validation logic used by both
 * Authentication and AdminAuth middleware.
 *
 * @param config - Token and error configuration
 * @returns The validated user and their profile
 */
export const validateUserFromToken = <E>(
  config: TokenValidationConfig<E>
): Effect.Effect<
  ValidatedUserResult,
  E | SqlError | JWTError,
  JWTService | UserRepository
> =>
  Effect.gen(function* () {
    const jwtService = yield* JWTService
    const userRepo = yield* UserRepository
    const { token, createError, requireAdmin = false } = config

    const tokenValue = Redacted.value(token)

    // Verify JWT token
    const payload = yield* jwtService.verifyAccessToken(tokenValue)

    // Check user status from JWT payload (early exit before DB hit)
    if (payload.status !== 'active') {
      return yield* Effect.fail(createError('Account is not active'))
    }

    // Check admin role if required (early exit before DB hit)
    if (requireAdmin && payload.role !== 'admin') {
      return yield* Effect.fail(createError('Insufficient permissions'))
    }

    // Fetch user from database
    const user = yield* pipe(
      userRepo.findById(payload.sub),
      Effect.map(Option.fromNullable),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(createError('Authentication failed')),
          onSome: Effect.succeed,
        })
      )
    )

    // Double-check user status from DB (in case it changed after token was issued)
    if (user.status !== 'active') {
      return yield* Effect.fail(createError('Account is not active'))
    }

    // Check admin role from DB if required
    if (requireAdmin && user.role !== 'admin') {
      return yield* Effect.fail(createError('Insufficient permissions'))
    }

    // Build user profile
    const profile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: Option.getOrUndefined(Option.fromNullable(user.name)),
      timezone: Option.getOrUndefined(Option.fromNullable(user.timezone)),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      status: user.status,
    }

    return { user, profile }
  })
