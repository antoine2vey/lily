import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { UsernameRequest, UserProfile } from '@lily/shared/auth'
import { Effect, String as EffectString } from 'effect'

/**
 * Set or update username for the current user
 * Requires authentication middleware to provide CurrentUser context
 */
export const setUsername = (
  request: UsernameRequest
): Effect.Effect<
  UserProfile,
  { message: string },
  UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser
    const userRepo = yield* UserRepository

    // Validate username format
    const username = EffectString.trim(request.username)
    if (username.length < 3) {
      return yield* Effect.fail({
        message: 'Username must be at least 3 characters',
      })
    }
    if (username.length > 30) {
      return yield* Effect.fail({
        message: 'Username must be at most 30 characters',
      })
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return yield* Effect.fail({
        message: 'Username can only contain letters, numbers, and underscores',
      })
    }

    // Check if username is already taken (if different from current)
    if (currentUser.name !== username) {
      const existingUser = yield* userRepo.findByUsername(username)
      if (existingUser && existingUser.id !== currentUser.id) {
        return yield* Effect.fail({ message: 'Username is already taken' })
      }
    }

    // Update username
    const updatedUser = yield* userRepo.update(currentUser.id, {
      name: username,
    })

    if (!updatedUser) {
      return yield* Effect.fail({ message: 'Failed to update username' })
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
