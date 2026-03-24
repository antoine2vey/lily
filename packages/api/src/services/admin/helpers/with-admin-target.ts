import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import type { users } from '@lily/db/schema'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

/**
 * Shared guard for admin endpoints that target a specific user.
 * Yields the resolved AdminUser context, validates that the admin
 * is not targeting themselves, and fetches the target user.
 */
export const withAdminTarget = (
  userId: string
): Effect.Effect<
  {
    user: typeof users.$inferSelect
    currentAdmin: Effect.Effect.Success<typeof AdminUser>
  },
  SqlError | CannotModifySelfError | UserNotFoundError,
  UserRepository | AdminUser
> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    if (userId === currentAdmin.id) {
      return yield* new CannotModifySelfError()
    }

    const user = yield* userRepo.findById(userId)
    if (!user) {
      return yield* new UserNotFoundError()
    }

    return { user, currentAdmin }
  })
