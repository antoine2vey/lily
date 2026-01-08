import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { Session } from '@lily/api/services/auth/session'
import type { NotificationsListResponse } from '@lily/shared/notification'
import { Effect } from 'effect'

// Get notifications for current user
export const getNotifications = (params: {
  page?: number
  limit?: number
  status?: 'pending' | 'queued' | 'sent' | 'failed' | 'all'
}): Effect.Effect<
  NotificationsListResponse,
  SqlError,
  NotificationRepository | Session
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    const { userId } = yield* Session

    return yield* repo.findByUserId({
      userId,
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
      ...(params.status !== undefined && { status: params.status }),
    })
  })
