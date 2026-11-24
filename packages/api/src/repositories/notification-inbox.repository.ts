import {
  mapToNotification,
  type NotificationRow,
} from '@lily/api/repositories/helpers/notification-row'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { notifications } from '@lily/db/schema'
import { paginate } from '@lily/shared'
import type { NotificationsListResponse } from '@lily/shared/notification'
import { and, count, desc, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface FindNotificationsParams {
  userId: string
  page?: number
  limit?: number
  status?: 'pending' | 'queued' | 'sent' | 'failed' | 'all'
}

/** The user's own notifications: the list, the unread count, reading and deleting them. */
export class NotificationInbox extends Context.Service<
  NotificationInbox,
  {
    readonly findByUserId: (
      params: FindNotificationsParams
    ) => Effect.Effect<NotificationsListResponse, SqlError>
    readonly findById: (
      id: string
    ) => Effect.Effect<NotificationRow | null, SqlError>
    readonly markAsRead: (
      id: string
    ) => Effect.Effect<NotificationRow | null, SqlError>
    readonly delete: (
      id: string
    ) => Effect.Effect<NotificationRow | null, SqlError>
    readonly countUnreadByUserId: (
      userId: string
    ) => Effect.Effect<number, SqlError>
    readonly markAllAsReadByUserId: (
      userId: string
    ) => Effect.Effect<void, SqlError>
  }
>()('NotificationInbox') {}

export const NotificationInboxLive = Layer.effect(
  NotificationInbox,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    return NotificationInbox.of({
      findByUserId: Effect.fn('NotificationInbox.findByUserId')(function* (
        params: FindNotificationsParams
      ) {
        const { page, limit, offset } = getPaginationParams(params)

        const filterConditions =
          params.status && params.status !== 'all'
            ? and(
                eq(notifications.userId, params.userId),
                eq(notifications.status, params.status)
              )
            : eq(notifications.userId, params.userId)

        const countResult = yield* db
          .select({ value: count() })
          .from(notifications)
          .where(filterConditions)
        const total = extractCount(countResult)

        const rows = yield* db
          .select()
          .from(notifications)
          .where(filterConditions)
          .offset(offset)
          .limit(limit)
          .orderBy(desc(notifications.createdAt))

        return paginate(Array.map(rows, mapToNotification), total, page, limit)
      }),

      findById: Effect.fn('NotificationInbox.findById')(function* (id: string) {
        const [row] = yield* db
          .select()
          .from(notifications)
          .where(eq(notifications.id, id))
        return row ? mapToNotification(row) : null
      }),

      markAsRead: Effect.fn('NotificationInbox.markAsRead')(function* (
        id: string
      ) {
        const [row] = yield* db
          .update(notifications)
          .set({ isRead: true })
          .where(eq(notifications.id, id))
          .returning()
        return row ? mapToNotification(row) : null
      }),

      delete: Effect.fn('NotificationInbox.delete')(function* (id: string) {
        const [row] = yield* db
          .delete(notifications)
          .where(eq(notifications.id, id))
          .returning()
        return row ? mapToNotification(row) : null
      }),

      countUnreadByUserId: Effect.fn('NotificationInbox.countUnreadByUserId')(
        function* (userId: string) {
          const result = yield* db
            .select({ value: count() })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                eq(notifications.status, 'sent'),
                eq(notifications.isRead, false)
              )
            )
          return extractCount(result)
        }
      ),

      markAllAsReadByUserId: Effect.fn(
        'NotificationInbox.markAllAsReadByUserId'
      )(function* (userId: string) {
        yield* db
          .update(notifications)
          .set({ isRead: true })
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.isRead, false)
            )
          )
      }),
    })
  })
)
