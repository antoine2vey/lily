import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { notifications, plants } from '@lily/db/schema'
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
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

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
  status?: Extract<NotificationStatus, 'pending' | 'queued'>
}

// Helper to map database row to API Notification type
const mapToNotification = (
  row: typeof notifications.$inferSelect
): Notification => ({
  id: row.id,
  type: row.type,
  title: Option.getOrUndefined(Option.fromNullishOr(row.title)),
  body: Option.getOrUndefined(Option.fromNullishOr(row.body)),
  scheduledAt: row.scheduledAt,
  sentAt: Option.getOrUndefined(Option.fromNullishOr(row.sentAt)),
  isRead: row.isRead,
  status: row.status as NotificationStatus,
  retryCount: row.retryCount,
  lastError: Option.getOrUndefined(Option.fromNullishOr(row.lastError)),
  userId: row.userId,
  plantId: Option.getOrUndefined(Option.fromNullishOr(row.plantId)),
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
  readonly findByIds: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<Notification>, SqlError>
  readonly markAsRead: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly create: (
    data: CreateNotificationData
  ) => Effect.Effect<Notification | null, SqlError>
  readonly delete: (id: string) => Effect.Effect<Notification | null, SqlError>
  // Scheduler methods
  readonly claimPendingToSchedule: (
    limit: number
  ) => Effect.Effect<Notification[], SqlError>
  readonly releaseUnclaimed: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<void, SqlError>
  readonly claimForDelivery: (
    ids: ReadonlyArray<string>,
    messageId: string
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  readonly releaseUnclaimedOlderThan: (
    queuedBefore: Date
  ) => Effect.Effect<number, SqlError>
  readonly failAbandonedDeliveries: (
    queuedBefore: Date,
    error: string
  ) => Effect.Effect<number, SqlError>
  readonly incrementRetryCount: (
    id: string
  ) => Effect.Effect<Notification | null, SqlError>
  readonly deletePendingByPlantAndType: (
    plantId: string,
    type: NotificationTopic
  ) => Effect.Effect<void, SqlError>
  readonly deletePendingByUserIdAndTypes: (
    userId: string,
    types: ReadonlyArray<NotificationTopic>
  ) => Effect.Effect<void, SqlError>
  readonly deletePendingByPlantId: (
    plantId: string
  ) => Effect.Effect<void, SqlError>
  readonly deleteUndeliveredByUserAndPlant: (
    userId: string,
    plantId: string
  ) => Effect.Effect<void, SqlError>
  readonly lockPlantReminderInTransaction: (
    plantId: string,
    type: string
  ) => Effect.Effect<void, SqlError>
  readonly deleteUndeliveredByUserPlantAndType: (
    userId: string,
    plantId: string,
    type: string
  ) => Effect.Effect<void, SqlError>
  readonly deleteForReschedule: (
    plantId: string,
    recipientIds: ReadonlyArray<string>
  ) => Effect.Effect<void, SqlError>
  readonly findSentSince: (
    userId: string,
    since: Date
  ) => Effect.Effect<
    ReadonlyArray<{ readonly plantId: string | null; readonly type: string }>,
    SqlError
  >
  readonly createPendingMany: (
    rows: ReadonlyArray<CreateNotificationData>
  ) => Effect.Effect<void, SqlError>
  readonly deleteUndeliveredForMemberOnCanopy: (
    userId: string,
    canopyId: string
  ) => Effect.Effect<void, SqlError>
  readonly deleteByIds: (
    ids: ReadonlyArray<string>
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
  readonly countUnreadByUserId: (
    userId: string
  ) => Effect.Effect<number, SqlError>
  readonly markAllAsReadByUserId: (
    userId: string
  ) => Effect.Effect<void, SqlError>
  readonly setQueuedContent: (
    ids: readonly string[],
    title: string,
    body: string
  ) => Effect.Effect<void, SqlError>
}

// Tag for dependency injection
export class NotificationRepository extends Context.Service<
  NotificationRepository,
  INotificationRepository
>()('NotificationRepository') {}

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

      findByIds: Effect.fn('NotificationRepository.findByIds')(function* (
        ids: ReadonlyArray<string>
      ) {
        if (Array.isReadonlyArrayEmpty(ids)) return []
        const rows = yield* db
          .select()
          .from(notifications)
          .where(inArray(notifications.id, [...ids]))
        return Array.map(rows, mapToNotification)
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
        const status = Option.getOrElse(
          Option.fromNullishOr(data.status),
          () => 'pending' as const
        )
        const [row] = yield* db
          .insert(notifications)
          .values({
            type: data.type,
            title: data.title,
            body: data.body,
            scheduledAt: data.scheduledAt,
            userId: data.userId,
            plantId: Option.getOrNull(Option.fromNullishOr(data.plantId)),
            status,
            queuedAt: status === 'queued' ? nowAsDate() : null,
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
      claimPendingToSchedule: Effect.fn(
        'NotificationRepository.claimPendingToSchedule'
      )(function* (limit: number) {
        const now = nowAsDate()
        const due = db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.status, 'pending'),
              lte(notifications.scheduledAt, now)
            )
          )
          .orderBy(notifications.scheduledAt)
          .limit(limit)
          .for('update', { skipLocked: true })
        const rows = yield* db
          .update(notifications)
          .set({ status: 'queued', queuedAt: now })
          .where(inArray(notifications.id, due))
          .returning()
        return Array.map(rows, mapToNotification)
      }),

      releaseUnclaimed: Effect.fn('NotificationRepository.releaseUnclaimed')(
        function* (ids: ReadonlyArray<string>) {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({ status: 'pending', queuedAt: null })
            .where(
              and(
                inArray(notifications.id, [...ids]),
                eq(notifications.status, 'queued'),
                isNull(notifications.deliveryMessageId)
              )
            )
        }
      ),

      claimForDelivery: Effect.fn('NotificationRepository.claimForDelivery')(
        function* (ids: ReadonlyArray<string>, messageId: string) {
          if (ids.length === 0) return []
          const rows = yield* db
            .update(notifications)
            .set({ deliveryMessageId: messageId })
            .where(
              and(
                inArray(notifications.id, [...ids]),
                eq(notifications.status, 'queued'),
                or(
                  isNull(notifications.deliveryMessageId),
                  eq(notifications.deliveryMessageId, messageId)
                )
              )
            )
            .returning({ id: notifications.id })
          return Array.map(rows, (row) => row.id)
        }
      ),

      releaseUnclaimedOlderThan: Effect.fn(
        'NotificationRepository.releaseUnclaimedOlderThan'
      )(function* (queuedBefore: Date) {
        const rows = yield* db
          .update(notifications)
          .set({ status: 'pending', queuedAt: null })
          .where(
            and(
              eq(notifications.status, 'queued'),
              isNull(notifications.deliveryMessageId),
              lt(notifications.queuedAt, queuedBefore)
            )
          )
          .returning({ id: notifications.id })
        return Array.length(rows)
      }),

      failAbandonedDeliveries: Effect.fn(
        'NotificationRepository.failAbandonedDeliveries'
      )(function* (queuedBefore: Date, error: string) {
        const rows = yield* db
          .update(notifications)
          .set({ status: 'failed', lastError: error })
          .where(
            and(
              eq(notifications.status, 'queued'),
              or(
                isNull(notifications.queuedAt),
                and(
                  isNotNull(notifications.deliveryMessageId),
                  lt(notifications.queuedAt, queuedBefore)
                )
              )
            )
          )
          .returning({ id: notifications.id })
        return Array.length(rows)
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

      deletePendingByUserIdAndTypes: Effect.fn(
        'NotificationRepository.deletePendingByUserIdAndTypes'
      )(function* (userId: string, types: ReadonlyArray<NotificationTopic>) {
        if (types.length === 0) return
        yield* db
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              inArray(notifications.type, [...types]),
              eq(notifications.status, 'pending')
            )
          )
      }),

      deletePendingByPlantId: Effect.fn(
        'NotificationRepository.deletePendingByPlantId'
      )(function* (plantId: string) {
        yield* db
          .delete(notifications)
          .where(
            and(
              eq(notifications.plantId, plantId),
              eq(notifications.status, 'pending')
            )
          )
      }),

      deleteUndeliveredByUserAndPlant: Effect.fn(
        'NotificationRepository.deleteUndeliveredByUserAndPlant'
      )(function* (userId: string, plantId: string) {
        yield* db
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.plantId, plantId),
              inArray(notifications.status, ['pending', 'queued'])
            )
          )
      }),

      lockPlantReminderInTransaction: Effect.fn(
        'NotificationRepository.lockPlantReminderInTransaction'
      )(function* (plantId: string, type: string) {
        yield* db.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`reminder:${plantId}`}), hashtext(${type}))`
        )
      }),

      deleteUndeliveredByUserPlantAndType: Effect.fn(
        'NotificationRepository.deleteUndeliveredByUserPlantAndType'
      )(function* (userId: string, plantId: string, type: string) {
        yield* db
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.plantId, plantId),
              eq(notifications.type, type),
              inArray(notifications.status, ['pending', 'queued'])
            )
          )
      }),

      deleteForReschedule: Effect.fn(
        'NotificationRepository.deleteForReschedule'
      )(function* (plantId: string, recipientIds: ReadonlyArray<string>) {
        yield* db
          .delete(notifications)
          .where(
            and(
              eq(notifications.plantId, plantId),
              or(
                eq(notifications.status, 'pending'),
                and(
                  eq(notifications.status, 'queued'),
                  ...(Array.isReadonlyArrayNonEmpty(recipientIds)
                    ? [notInArray(notifications.userId, [...recipientIds])]
                    : [])
                )
              )
            )
          )
      }),

      findSentSince: Effect.fn('NotificationRepository.findSentSince')(
        function* (userId: string, since: Date) {
          return yield* db
            .select({
              plantId: notifications.plantId,
              type: notifications.type,
            })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                eq(notifications.status, 'sent'),
                gte(notifications.sentAt, since)
              )
            )
        }
      ),

      createPendingMany: Effect.fn('NotificationRepository.createPendingMany')(
        function* (rows: ReadonlyArray<CreateNotificationData>) {
          if (Array.isReadonlyArrayEmpty(rows)) return
          yield* db.insert(notifications).values(
            Array.map(rows, (row) => ({
              type: row.type,
              scheduledAt: row.scheduledAt,
              userId: row.userId,
              plantId: Option.getOrNull(Option.fromNullishOr(row.plantId)),
              status: 'pending' as const,
            }))
          )
        }
      ),

      deleteUndeliveredForMemberOnCanopy: Effect.fn(
        'NotificationRepository.deleteUndeliveredForMemberOnCanopy'
      )(function* (userId: string, canopyId: string) {
        yield* db
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              inArray(notifications.status, ['pending', 'queued']),
              inArray(
                notifications.plantId,
                db
                  .select({ id: plants.id })
                  .from(plants)
                  .where(eq(plants.canopyId, canopyId))
              )
            )
          )
      }),

      deleteByIds: Effect.fn('NotificationRepository.deleteByIds')(function* (
        ids: ReadonlyArray<string>
      ) {
        if (ids.length === 0) return
        yield* db
          .delete(notifications)
          .where(inArray(notifications.id, [...ids]))
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
            Option.fromNullishOr(result),
            Option.flatMap((r) => Option.fromNullishOr(r.count)),
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
      markManyAsSent: Effect.fn('NotificationRepository.markManyAsSent')(
        function* (ids: readonly string[]) {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({
              status: 'sent',
              sentAt: nowAsDate(),
            })
            .where(
              and(
                inArray(notifications.id, [...ids]),
                eq(notifications.status, 'queued')
              )
            )
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
            .where(
              and(
                inArray(notifications.id, [...ids]),
                eq(notifications.status, 'queued')
              )
            )
        }
      ),

      countUnreadByUserId: Effect.fn(
        'NotificationRepository.countUnreadByUserId'
      )(function* (userId: string) {
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
      }),

      markAllAsReadByUserId: Effect.fn(
        'NotificationRepository.markAllAsReadByUserId'
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

      setQueuedContent: Effect.fn('NotificationRepository.setQueuedContent')(
        function* (ids: readonly string[], title: string, body: string) {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({ title, body })
            .where(
              and(
                inArray(notifications.id, [...ids]),
                eq(notifications.status, 'queued')
              )
            )
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
            Option.fromNullishOr(result),
            Option.flatMap((r) => Option.fromNullishOr(r.count)),
            Option.getOrElse(() => 0)
          ) > 0
        )
      }),
    }
  })
)
