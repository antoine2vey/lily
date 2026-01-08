import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { notifications } from '@lily/db'
import type { Notification, NotificationStatus } from '@lily/shared/notification'
import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

// Types for repository methods
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
  sentAt: row.sentAt ?? undefined,
  isRead: row.isRead,
  status: row.status as NotificationStatus,
  retryCount: row.retryCount,
  lastError: row.lastError ?? undefined,
  userId: row.userId,
  plantId: row.plantId ?? undefined,
  createdAt: row.createdAt,
})

// Repository service interface
export interface INotificationRepository {
  readonly findByUserId: (
    userId: string
  ) => Effect.Effect<Notification[], SqlError>
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
      findByUserId: (userId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(desc(notifications.createdAt))
          return rows.map(mapToNotification)
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
              plantId: data.plantId ?? null,
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
          return rows.map(mapToNotification)
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
    }
  })
)
