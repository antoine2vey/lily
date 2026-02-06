import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { NotificationsListResponse } from '@lily/shared/notification'
import { Effect } from 'effect'

export const getNotifications = (params: {
  page?: number
  limit?: number
  status?: 'pending' | 'queued' | 'sent' | 'failed' | 'all'
}): Effect.Effect<
  NotificationsListResponse,
  SqlError,
  NotificationRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    const { id: userId } = yield* CurrentUser

    return yield* repo.findByUserId({
      userId,
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
      ...(params.status !== undefined && { status: params.status }),
    })
  })
