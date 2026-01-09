import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User, UserRole } from '@lily/shared/user'
import { Effect } from 'effect'

export const updateRole = (
  id: string,
  role: UserRole
): Effect.Effect<
  User,
  SqlError | UserNotFoundError | CannotModifySelfError,
  UserRepository | AdminUser
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    // Prevent admins from changing their own role
    if (id === currentAdmin.id) {
      return yield* Effect.fail(new CannotModifySelfError())
    }

    const updated = yield* repo.updateRole(id, role)

    if (!updated) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return updated
  })
