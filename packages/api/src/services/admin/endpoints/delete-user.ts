import type { Outbox } from '@lily/api/kernel/outbox'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { MessageQueue } from '@lily/shared/server'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const deleteUser = (
  id: string
): Effect.Effect<
  User,
  SqlError | UserNotFoundError | CannotModifySelfError,
  | UserRepository
  | AdminUser
  | SqlClient.SqlClient
  | CanopyRepository
  | NotificationRepository
  | DelegationRepository
  | PlantRepository
  | MessageQueue
  | Outbox
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
