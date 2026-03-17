import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { notifications } from '@lily/db/schema'
import {
  nowAsDate,
  paginate,
  startOfTodayAsDate,
  startOfTomorrowAsDate,
} from '@lily/shared'
import type {
  Notification,
  NotificationStatus,
  NotificationsListResponse,
} from '@lily/shared/notification'
import type { NotificationTopic } from '@lily/shared/server'
import { and, count, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

// Types for repository methods
export interface FindNotificationsParams {
  userId: string
  page?: number
  limit?: number
  status?: 'pending' | 'queued' | 'sent' | 'failed' | 'all'
}

export interface CreateNotificationData {
  type: NotificationTopic
  title?: string
  body?: string
  scheduledAt: Date
  userId: string
  plantId?: string
}

// Helper to map database row to API Notification type
const mapToNotification = (
  row: typeof notifications.$inferSelect
): Notification => ({
  id: row.id,
  type: row.type,
  title: Option.getOrUndefined(Option.fromNullable(row.title)),
  body: Option.getOrUndefined(Option.fromNullable(row.body)),
  scheduledAt: row.scheduledAt,
  sentAt: Option.getOrUndefined(Option.fromNullable(row.sentAt)),
  isRead: row.isRead,
  status: row.status as NotificationStatus,
  retryCount: row.retryCount,
  lastError: Option.getOrUndefined(Option.fromNullable(row.lastError)),
  userId: row.userId,
  plantId: Option.getOrUndefined(Option.fromNullable(row.plantId)),
  createdAt: row.createdAt,
})

// Repository service interface
export interface INotificationRepository {
  readonly findByUserId: (
    params: FindNotificationsParams
  ) => Effect.Effect<NotificationsListResponse, SqlError>
  readonly findById: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly markAsRead: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly create: (
    data: CreateNotificationData
  ) => Effect.Effect<Notification | null, SqlError>
  readonly delete: (id: string) => Effect.Effect<Notification | null, SqlError>
  // Scheduler methods
  readonly findPendingToSchedule: (
    limit: number
  ) => Effect.Effect<Notification[], SqlError>
  readonly incrementRetryCount: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly deletePendingByPlantAndType: (
    plantId: string,
    type: NotificationTopic
  ) => Effect.Effect<void, SqlError>
  readonly hasNotificationToday: (
    userId: string,
    plantId: string
  ) => Effect.Effect<boolean, SqlError>
  readonly findPendingByUserId: (
    userId: string
  ) => Effect.Effect<Notification[], SqlError>
  readonly updateScheduledAt: (
    id: string,
    scheduledAt: Date
  ) => Effect.Effect<Notification | null, SqlError>
  // Batch scheduler methods
  readonly markManyAsQueued: (
    ids: readonly string[]
  ) => Effect.Effect<void, SqlError>
  readonly markManyAsSent: (
    ids: readonly string[]
  ) => Effect.Effect<void, SqlError>
  readonly markManyAsFailed: (
    ids: readonly string[],
    error: string
  ) => Effect.Effect<void, SqlError>
  readonly hasNotificationOfTypeTodayForUser: (
    userId: string,
    timezone: string,
    type: NotificationTopic
  ) => Effect.Effect<boolean, SqlError>
}

// Tag for dependency injection
export class NotificationRepository extends Context.Tag(
  'NotificationRepository'
)<NotificationRepository, INotificationRepository>() {}

// Live implementation using PgDrizzle
export const NotificationRepositoryLive = Layer.effect(
  NotificationRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByUserId: Effect.fn('NotificationRepository.findByUserId')(function* (
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

      findById: Effect.fn('NotificationRepository.findById')(function* (
        id: string
      ) {
        const [row] = yield* db
          .select()
          .from(notifications)
          .where(eq(notifications.id, id))
        return row ? mapToNotification(row) : null
      }),

      markAsRead: Effect.fn('NotificationRepository.markAsRead')(function* (
        id: string
      ) {
        const [row] = yield* db
          .update(notifications)
          .set({ isRead: true })
          .where(eq(notifications.id, id))
          .returning()
        return row ? mapToNotification(row) : null
      }),

      create: Effect.fn('NotificationRepository.create')(function* (
        data: CreateNotificationData
      ) {
        const [row] = yield* db
          .insert(notifications)
          .values({
            type: data.type,
            title: data.title,
            body: data.body,
            scheduledAt: data.scheduledAt,
            userId: data.userId,
            plantId: Option.getOrNull(Option.fromNullable(data.plantId)),
          })
          .returning()
        return row ? mapToNotification(row) : null
      }),

      delete: Effect.fn('NotificationRepository.delete')(function* (
        id: string
      ) {
        const [row] = yield* db
          .delete(notifications)
          .where(eq(notifications.id, id))
          .returning()
        return row ? mapToNotification(row) : null
      }),

      // Scheduler methods
      findPendingToSchedule: Effect.fn(
        'NotificationRepository.findPendingToSchedule'
      )(function* (limit: number) {
        const rows = yield* db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.status, 'pending'),
              lte(notifications.scheduledAt, nowAsDate())
            )
          )
          .orderBy(notifications.scheduledAt)
          .limit(limit)
        return Array.map(rows, mapToNotification)
      }),

      incrementRetryCount: Effect.fn(
        'NotificationRepository.incrementRetryCount'
      )(function* (id: string) {
        const [row] = yield* db
          .update(notifications)
          .set({
            retryCount: sql`${notifications.retryCount} + 1`,
          })
          .where(eq(notifications.id, id))
          .returning()
        return row ? mapToNotification(row) : null
      }),

      deletePendingByPlantAndType: Effect.fn(
        'NotificationRepository.deletePendingByPlantAndType'
      )(function* (plantId: string, type: NotificationTopic) {
        yield* db
          .delete(notifications)
          .where(
            and(
              eq(notifications.plantId, plantId),
              eq(notifications.type, type),
              eq(notifications.status, 'pending')
            )
          )
      }),

      hasNotificationToday: Effect.fn(
        'NotificationRepository.hasNotificationToday'
      )(function* (userId: string, plantId: string) {
        const today = startOfTodayAsDate()
        const tomorrow = startOfTomorrowAsDate()

        const [result] = yield* db
          .select({ count: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.plantId, plantId),
              eq(notifications.status, 'sent'),
              sql`${notifications.sentAt} >= ${today}`,
              sql`${notifications.sentAt} < ${tomorrow}`
            )
          )
        return (
          pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.count)),
            Option.getOrElse(() => 0)
          ) > 0
        )
      }),

      findPendingByUserId: Effect.fn(
        'NotificationRepository.findPendingByUserId'
      )(function* (userId: string) {
        const rows = yield* db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.status, 'pending')
            )
          )
          .orderBy(notifications.scheduledAt)
        return Array.map(rows, mapToNotification)
      }),

      updateScheduledAt: Effect.fn('NotificationRepository.updateScheduledAt')(
        function* (id: string, scheduledAt: Date) {
          const [row] = yield* db
            .update(notifications)
            .set({ scheduledAt })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }
      ),

      // Batch scheduler methods
      markManyAsQueued: Effect.fn('NotificationRepository.markManyAsQueued')(
        function* (ids: readonly string[]) {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({ status: 'queued' })
            .where(inArray(notifications.id, [...ids]))
        }
      ),

      markManyAsSent: Effect.fn('NotificationRepository.markManyAsSent')(
        function* (ids: readonly string[]) {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({
              status: 'sent',
              sentAt: nowAsDate(),
            })
            .where(inArray(notifications.id, [...ids]))
        }
      ),

      markManyAsFailed: Effect.fn('NotificationRepository.markManyAsFailed')(
        function* (ids: readonly string[], error: string) {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({
              status: 'failed',
              lastError: error,
            })
            .where(inArray(notifications.id, [...ids]))
        }
      ),

      hasNotificationOfTypeTodayForUser: Effect.fn(
        'NotificationRepository.hasNotificationOfTypeTodayForUser'
      )(function* (userId: string, timezone: string, type: NotificationTopic) {
        const today = startOfTodayAsDate(timezone)
        const tomorrow = startOfTomorrowAsDate(timezone)

        const [result] = yield* db
          .select({ count: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.type, type),
              inArray(notifications.status, ['pending', 'queued', 'sent']),
              sql`${notifications.createdAt} >= ${today}`,
              sql`${notifications.createdAt} < ${tomorrow}`
            )
          )
        return (
          pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.count)),
            Option.getOrElse(() => 0)
          ) > 0
        )
      }),
    }
  })
)
