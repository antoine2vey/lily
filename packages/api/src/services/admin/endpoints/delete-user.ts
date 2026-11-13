import type { Absence } from '@lily/api/contexts/absence'
import type { Canopy } from '@lily/api/contexts/canopy'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const deleteUser = (
  id: string
): Effect.Effect<
  User,
  SqlError | UserNotFoundError | CannotModifySelfError,
  UserRepository | AdminUser | Canopy | Absence
> =>
  Effect.gen(function* () {
    const currentAdmin = yield* AdminUser

    // Prevent admins from deleting themselves
    if (id === currentAdmin.id) {
      return yield* new CannotModifySelfError()
    }

    const deleted = yield* purgeAccount(id)

    if (!deleted) {
      return yield* new UserNotFoundError()
    }

    return deleted
  }).pipe(
    Effect.withSpan('AdminService.deleteUser', {
      attributes: { 'user.id': id },
    })
  )
