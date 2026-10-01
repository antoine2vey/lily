import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { AuthError } from '@lily/shared'
import type { UsernameRequest, UserProfile } from '@lily/shared/auth'
import { Effect, String as EffectString } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Set or update username for the current user
 * Requires authentication middleware to provide CurrentUser context
 */
export const setUsername = (
  request: UsernameRequest
): Effect.Effect<
  UserProfile,
  AuthError | SqlError,
  UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser
    const userRepo = yield* UserRepository

    // Validate username format
    const username = EffectString.trim(request.username)
    if (username.length < 3) {
      return yield* new AuthError({
        message: 'Username must be at least 3 characters',
      })
    }
    if (username.length > 30) {
      return yield* new AuthError({
        message: 'Username must be at most 30 characters',
      })
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return yield* new AuthError({
        message: 'Username can only contain letters, numbers, and underscores',
      })
    }

    // Check if username is already taken (if different from current)
    if (currentUser.name !== username) {
      const existingUser = yield* userRepo.findByUsername(username)
      if (existingUser && existingUser.id !== currentUser.id) {
        return yield* new AuthError({ message: 'Username is already taken' })
      }
    }

    // Update username
    const updatedUser = yield* userRepo.update(currentUser.id, {
      name: username,
    })

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
