import { Absence } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import {
  exceptReminders,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { NOTIFICATION_TOPICS } from '@lily/shared/server'
import { Effect } from 'effect'

export const releaseAccount = (userId: string) =>
  Effect.gen(function* () {
    const canopy = yield* Canopy
    const absence = yield* Absence
    const userRepo = yield* UserRepository
    const refreshTokenRepo = yield* RefreshTokenRepository
    const deviceTokenRepo = yield* DeviceTokenRepository
    const notificationRepo = yield* NotificationRepository

    return yield* canopy.leaveForDeletion(userId)(
      Effect.gen(function* () {
        const released = yield* userRepo.softDelete(userId)
        yield* refreshTokenRepo.revokeAllForUser(userId)
        yield* deviceTokenRepo.deleteByUserId(userId)
        yield* absence.releaseForDeletion(userId)
        yield* notificationRepo.deletePendingByUserIdAndTypes(
          userId,
          exceptReminders(NOTIFICATION_TOPICS)
        )
        yield* Reminders.request(Dirty.Recipient({ userId }))
        return released
      })
    )
  }).pipe(
    Effect.withSpan('releaseAccount', { attributes: { 'user.id': userId } })
  )
