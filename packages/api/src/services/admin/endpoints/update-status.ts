import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { withUserRemindersRebuilt } from '@lily/api/services/plants/helpers/rebuild-user-reminders'
import type { ReminderContext } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User, UserStatus } from '@lily/shared/user'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const updateStatus = (
  id: string,
  status: UserStatus
): Effect.Effect<
  User,
  SqlError | UserNotFoundError | CannotModifySelfError,
  UserRepository | AdminUser | ReminderContext | DelegationRepository
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    // Prevent admins from changing their own status
    if (id === currentAdmin.id) {
      return yield* new CannotModifySelfError()
    }

    return yield* withUserRemindersRebuilt(id)(
      Effect.flatMap(repo.updateStatus(id, status), (updated) =>
        updated ? Effect.succeed(updated) : Effect.fail(new UserNotFoundError())
      )
    )
  }).pipe(
    Effect.withSpan('AdminService.updateStatus', {
      attributes: { 'user.id': id, 'user.status': status },
    })
  )
