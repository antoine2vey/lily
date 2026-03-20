import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { UnreadCountResponse } from '@lily/shared/notification'
import { Effect } from 'effect'

export const getUnreadCount = (): Effect.Effect<
  UnreadCountResponse,
  SqlError,
  NotificationRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    const { id: userId } = yield* CurrentUser

    const count = yield* repo.countUnreadByUserId(userId)
    return { count }
  }).pipe(Effect.withSpan('NotificationsService.getUnreadCount'))
