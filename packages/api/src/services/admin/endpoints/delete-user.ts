import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { leaveCanopyIfMember } from '@lily/api/services/canopy/helpers/leave-canopy'
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
  | CareScheduleRepository
  | NotificationRepository
  | DelegationRepository
  | PlantRepository
  | MessageQueue
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    // Prevent admins from deleting themselves
    if (id === currentAdmin.id) {
      return yield* new CannotModifySelfError()
    }

    yield* leaveCanopyIfMember(id)
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
