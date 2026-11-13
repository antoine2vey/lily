import { Canopy } from '@lily/api/contexts/canopy'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import {
  exceptReminders,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { nowAsDate, UserNotFoundError } from '@lily/shared'
import { NOTIFICATION_TOPICS } from '@lily/shared/server'
import { Effect, Option, pipe } from 'effect'

export const deleteAccount = Effect.fn('UserService.deleteAccount')(
  function* () {
    const user = yield* CurrentUser
    const userRepo = yield* UserRepository
    const refreshTokenRepo = yield* RefreshTokenRepository
    const deviceTokenRepo = yield* DeviceTokenRepository
    const delegationRepo = yield* DelegationRepository
    const notificationRepo = yield* NotificationRepository
    const canopy = yield* Canopy

    const deleted = yield* canopy.leaveForDeletion(user.id)(
      Effect.gen(function* () {
        const softDeleted = yield* userRepo.softDelete(user.id)
        yield* refreshTokenRepo.revokeAllForUser(user.id)
        yield* deviceTokenRepo.deleteByUserId(user.id)
        const { reassignedPlantIds } = yield* delegationRepo.cancelOpenForUser(
          user.id,
          nowAsDate()
        )
        yield* notificationRepo.deletePendingByUserIdAndTypes(
          user.id,
          exceptReminders(NOTIFICATION_TOPICS)
        )
        yield* Reminders.request(
          Dirty.Plants({ plantIds: reassignedPlantIds }),
          Dirty.Recipient({ userId: user.id })
        )
        return softDeleted
      })
    )

    yield* pipe(
      Option.fromNullishOr(deleted),
      Option.match({
        onNone: () => Effect.fail(new UserNotFoundError()),
        onSome: () => Effect.void,
      })
    )

    return { message: 'Account scheduled for deletion' }
  }
)
