import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { Session } from '@lily/api/services/auth/session'
import type { Notification } from '@lily/shared/notification'
import { Effect } from 'effect'

// Get notifications for current user
export const getNotifications = (): Effect.Effect<
  Notification[],
  SqlError,
  NotificationRepository | Session
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    const { userId } = yield* Session

    const notifications = yield* repo.findByUserId(userId)

    return notifications
  })
