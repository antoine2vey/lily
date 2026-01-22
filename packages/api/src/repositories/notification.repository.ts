import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { notifications } from '@lily/db'
import { paginate } from '@lily/shared'
import type {
  Notification,
  NotificationStatus,
  NotificationsListResponse,
} from '@lily/shared/notification'
import { and, count, desc, eq, lte, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

// Types for repository methods
export interface FindNotificationsParams {
  userId: string
  page?: number
  limit?: number
  status?: 'pending' | 'queued' | 'sent' | 'failed' | 'all'
}

export interface CreateNotificationData {
  type: string
  title: string
  body: string
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
  title: row.title,
  body: row.body,
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
  readonly markAsQueued: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly markAsSent: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly markAsFailed: (
    id: string,
    error: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly incrementRetryCount: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly deletePendingByPlantAndType: (
    plantId: string,
    type: string
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
      findByUserId: (params: FindNotificationsParams) =>
        Effect.gen(function* () {
          const page = pipe(
            Option.fromNullable(params.page),
            Option.getOrElse(() => 1)
          )
          const limit = pipe(
            Option.fromNullable(params.limit),
            Option.getOrElse(() => 20)
          )
          const offset = (page - 1) * limit

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
          const total = pipe(
            Array.head(countResult),
            Option.flatMap((r) => Option.fromNullable(r.value)),
            Option.getOrElse(() => 0)
          )

          const rows = yield* db
            .select()
            .from(notifications)
            .where(filterConditions)
            .offset(offset)
            .limit(limit)
            .orderBy(desc(notifications.createdAt))

          return paginate(
            Array.map(rows, mapToNotification),
            total,
            page,
            limit
          )
        }),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(notifications)
            .where(eq(notifications.id, id))
          return row ? mapToNotification(row) : null
        }),

      markAsRead: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({ isRead: true })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }),

      create: (data: CreateNotificationData) =>
        Effect.gen(function* () {
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

      delete: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .delete(notifications)
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }),

      // Scheduler methods
      findPendingToSchedule: (limit: number) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.status, 'pending'),
                lte(notifications.scheduledAt, new Date())
              )
            )
            .orderBy(notifications.scheduledAt)
            .limit(limit)
          return Array.map(rows, mapToNotification)
        }),

      markAsQueued: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({ status: 'queued' })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }),

      markAsSent: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({
              status: 'sent',
              sentAt: new Date(),
            })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }),

      markAsFailed: (id: string, error: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({
              status: 'failed',
              lastError: error,
            })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }),

      incrementRetryCount: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({
              retryCount: sql`${notifications.retryCount} + 1`,
            })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }),

      deletePendingByPlantAndType: (plantId: string, type: string) =>
        Effect.gen(function* () {
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

      hasNotificationToday: (userId: string, plantId: string) =>
        Effect.gen(function* () {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const tomorrow = new Date(today)
          tomorrow.setDate(tomorrow.getDate() + 1)

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

      findPendingByUserId: (userId: string) =>
        Effect.gen(function* () {
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

      updateScheduledAt: (id: string, scheduledAt: Date) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({ scheduledAt })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }),
    }
  })
)
