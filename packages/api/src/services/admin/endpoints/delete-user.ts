import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const deleteUser = (
  id: string
): Effect.Effect<
  User,
  SqlError | UserNotFoundError | CannotModifySelfError,
  UserRepository | AdminUser
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    // Prevent admins from deleting themselves
    if (id === currentAdmin.id) {
      return yield* new CannotModifySelfError()
    }

    const deleted = yield* repo.delete(id)

    if (!deleted) {
      return yield* new UserNotFoundError()
    }

    return deleted
  }).pipe(
    Effect.withSpan('AdminService.deleteUser', {
      attributes: { 'user.id': id },
    })
  )
