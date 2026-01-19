import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'

/**
 * Get current authenticated user profile
 * Requires authentication middleware to provide CurrentUser context
 */
export const getCurrentUser = (): Effect.Effect<
  UserProfile,
  { message: string },
  CurrentUser
> =>
  Effect.gen(function* () {
    // CurrentUser is provided by the auth middleware
    const user = yield* CurrentUser

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      status: user.status,
    }
  })
