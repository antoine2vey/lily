import { NotificationInbox } from '@lily/api/repositories/notification-inbox.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const markAllRead: Effect.Effect<
  void,
  SqlError,
  NotificationInbox | CurrentUser
> = Effect.gen(function* () {
  const repo = yield* NotificationInbox
  const { id: userId } = yield* CurrentUser

  yield* repo.markAllAsReadByUserId(userId)
}).pipe(Effect.withSpan('NotificationsService.markAllRead'))
