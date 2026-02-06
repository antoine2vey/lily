import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User, UserStatus } from '@lily/shared/user'
import { Effect } from 'effect'

export const updateStatus = (
  id: string,
  status: UserStatus
): Effect.Effect<
  User,
  SqlError | UserNotFoundError | CannotModifySelfError,
  UserRepository | AdminUser
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    // Prevent admins from changing their own status
    if (id === currentAdmin.id) {
      return yield* Effect.fail(new CannotModifySelfError())
    }

    const updated = yield* repo.updateStatus(id, status)

    if (!updated) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return updated
  })
