import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { notifications } from '@lily/db'
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

          return paginate(
            Array.map(rows, mapToNotification),
            total,
            page,
            limit
          )
        }).pipe(Effect.withSpan('NotificationRepository.findByUserId')),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(notifications)
            .where(eq(notifications.id, id))
          return row ? mapToNotification(row) : null
        }).pipe(Effect.withSpan('NotificationRepository.findById')),

      markAsRead: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({ isRead: true })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }).pipe(Effect.withSpan('NotificationRepository.markAsRead')),

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
        }).pipe(Effect.withSpan('NotificationRepository.create')),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .delete(notifications)
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }).pipe(Effect.withSpan('NotificationRepository.delete')),

      // Scheduler methods
      findPendingToSchedule: (limit: number) =>
        Effect.gen(function* () {
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
        }).pipe(
          Effect.withSpan('NotificationRepository.findPendingToSchedule')
        ),

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
        }).pipe(Effect.withSpan('NotificationRepository.incrementRetryCount')),

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
        }).pipe(
          Effect.withSpan('NotificationRepository.deletePendingByPlantAndType')
        ),

      hasNotificationToday: (userId: string, plantId: string) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('NotificationRepository.hasNotificationToday')),

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
        }).pipe(Effect.withSpan('NotificationRepository.findPendingByUserId')),

      updateScheduledAt: (id: string, scheduledAt: Date) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(notifications)
            .set({ scheduledAt })
            .where(eq(notifications.id, id))
            .returning()
          return row ? mapToNotification(row) : null
        }).pipe(Effect.withSpan('NotificationRepository.updateScheduledAt')),

      // Batch scheduler methods
      markManyAsQueued: (ids: readonly string[]) =>
        Effect.gen(function* () {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({ status: 'queued' })
            .where(inArray(notifications.id, ids as string[]))
        }).pipe(Effect.withSpan('NotificationRepository.markManyAsQueued')),

      markManyAsSent: (ids: readonly string[]) =>
        Effect.gen(function* () {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({
              status: 'sent',
              sentAt: nowAsDate(),
            })
            .where(inArray(notifications.id, ids as string[]))
        }).pipe(Effect.withSpan('NotificationRepository.markManyAsSent')),

      markManyAsFailed: (ids: readonly string[], error: string) =>
        Effect.gen(function* () {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({
              status: 'failed',
              lastError: error,
            })
            .where(inArray(notifications.id, ids as string[]))
        }).pipe(Effect.withSpan('NotificationRepository.markManyAsFailed')),
    }
  })
)
