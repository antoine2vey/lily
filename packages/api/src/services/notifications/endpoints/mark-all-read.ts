import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const markAllRead = (): Effect.Effect<
  void,
  SqlError,
  NotificationRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    const { id: userId } = yield* CurrentUser

    yield* repo.markAllAsReadByUserId(userId)
  }).pipe(Effect.withSpan('NotificationsService.markAllRead'))
