import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import type { RateLimiterService } from '@lily/api/services/rate-limiter/service'
import {
  claimUsername,
  usernameTakenOnConflict,
} from '@lily/api/services/username/claim-username'
import { AuthError } from '@lily/shared'
import type { UsernameRequest, UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Set or update username for the current user
 * Requires authentication middleware to provide CurrentUser context
 */
export const setUsername = (
  request: UsernameRequest
): Effect.Effect<
  UserProfile,
  AuthError | RateLimitExceededError | SqlError,
  UserRepository | CurrentUser | RateLimiterService
> =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser
    const userRepo = yield* UserRepository

    const username = yield* claimUsername(currentUser, request.username)

    const updatedUser = yield* usernameTakenOnConflict(
      userRepo.update(currentUser.id, { name: username })
    )

    if (!updatedUser) {
      return yield* new AuthError({ message: 'Failed to update username' })
    }

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      username: updatedUser.name || undefined,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      role: updatedUser.role,
      status: updatedUser.status,
    }
  }).pipe(Effect.withSpan('AuthService.setUsername'))
