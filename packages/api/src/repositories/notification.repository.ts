import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { notifications, plants, users } from '@lily/db/schema'
import {
  nowAsDate,
  paginate,
  startOfTodayAsDate,
  startOfTomorrowAsDate,
} from '@lily/shared'
import type {
  MetadataOf,
  Notification,
  NotificationStatus,
  NotificationsListResponse,
} from '@lily/shared/notification'
import type { NotificationTopic } from '@lily/shared/server'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { Array, Context, Data, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Types for repository methods
export interface FindNotificationsParams {
  userId: string
  page?: number
  limit?: number
  status?: 'pending' | 'queued' | 'sent' | 'failed' | 'all'
}

interface CreateNotificationFields {
  title?: string
  body?: string
  scheduledAt: Date
  userId: string
  plantId?: string
  status?: Extract<NotificationStatus, 'pending' | 'queued'>
}

export interface DeferredNotification {
  readonly id: string
  readonly until: Date
}

export interface FailedAttempt {
  readonly id: string
  readonly status: Extract<NotificationStatus, 'pending' | 'failed'>
  readonly retryCount: number
}

export type CreateNotificationData<
  T extends NotificationTopic = NotificationTopic,
> = {
  [K in T]: CreateNotificationFields & {
    type: K
    metadata: MetadataOf<K>
  }
}[T]

export type NotificationRow = Notification & {
  readonly type: NotificationTopic
}

// Helper to map database row to API Notification type
const mapToNotification = (
  row: typeof notifications.$inferSelect
): NotificationRow => ({
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
  metadata: Option.getOrUndefined(Option.fromNullishOr(row.metadata)),
  createdAt: row.createdAt,
})

// Repository service interface
export interface INotificationRepository {
  readonly findByUserId: (
    params: FindNotificationsParams
  ) => Effect.Effect<NotificationsListResponse, SqlError>
  readonly findById: (
    id: string
  ) => Effect.Effect<NotificationRow | null, SqlError>
  readonly findByIds: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<NotificationRow>, SqlError>
  readonly markAsRead: (
    id: string
  ) => Effect.Effect<NotificationRow | null, SqlError>
  readonly create: <T extends NotificationTopic>(
    data: CreateNotificationData<T>
  ) => Effect.Effect<NotificationRow | null, SqlError>
  readonly delete: (
    id: string
  ) => Effect.Effect<NotificationRow | null, SqlError>
  // Scheduler methods
  readonly claimPendingToSchedule: (
    limit: number
  ) => Effect.Effect<NotificationRow[], SqlError>
  readonly releaseUnclaimed: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<void, SqlError>
  readonly deferUntil: (
    rows: ReadonlyArray<DeferredNotification>,
    heldBy: Option.Option<string>
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
  readonly retryLater: (
    ids: ReadonlyArray<string>,
    heldBy: string,
    retryAtAfterFailures: Array.NonEmptyReadonlyArray<Date>,
    error: string
  ) => Effect.Effect<ReadonlyArray<FailedAttempt>, SqlError>
  readonly deletePendingByPlantsAndType: (
    plantIds: ReadonlyArray<string>,
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
  readonly lockReminderKeys: (
    keys: ReadonlyArray<ReminderKey>,
    updatingUserId: Option.Option<string>
  ) => Effect.Effect<void, SqlError>
  readonly replaceReminders: (
    replacement: ReminderReplacement
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
  ) => Effect.Effect<NotificationRow[], SqlError>
  readonly updateScheduledAt: (
    id: string,
    scheduledAt: Date
  ) => Effect.Effect<NotificationRow | null, SqlError>
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
export interface ReminderKey {
  readonly plantId: string
  readonly type: NotificationTopic
}

export interface ReminderReplacement {
  readonly onlyUserId: string | null
  readonly plants: ReadonlyArray<{
    readonly plantId: string
    readonly types: ReadonlyArray<NotificationTopic>
    readonly recipientIds: ReadonlyArray<string>
    readonly plantWide: boolean
  }>
  readonly rows: ReadonlyArray<{
    readonly type: NotificationTopic
    readonly scheduledAt: Date
    readonly userId: string
    readonly plantId: string
    readonly guard: ReminderGuard
  }>
}

export type ReminderGuard = Data.TaggedEnum<{
  Always: {}
  NotRemindedSince: { readonly since: Date }
  ReplacesUndelivered: {}
}>
export const ReminderGuard = Data.taggedEnum<ReminderGuard>()

export const NotificationRepositoryLive = Layer.effect(
  NotificationRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const lockedInIdOrder = (where: SQL | undefined) =>
      db
        .select({ id: notifications.id })
        .from(notifications)
        .where(where)
        .orderBy(asc(notifications.id))
        .for('update')
    const lockHoldersOfUndeliveredReminders = (
      plantIds: ReadonlyArray<string>,
      idRange: SQL | undefined
    ) =>
      db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(
              users.id,
              db
                .select({ userId: notifications.userId })
                .from(notifications)
                .where(
                  and(
                    inArray(notifications.plantId, [...plantIds]),
                    or(
                      eq(notifications.status, 'pending'),
                      eq(notifications.status, 'queued')
                    )
                  )
                )
            ),
            idRange
          )
        )
        .orderBy(asc(users.id))
        .for('share')

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

      create: Effect.fn('NotificationRepository.create')(function* <
        T extends NotificationTopic,
      >(data: CreateNotificationData<T>) {
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
            metadata: data.metadata,
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

      deferUntil: Effect.fn('NotificationRepository.deferUntil')(function* (
        rows: ReadonlyArray<DeferredNotification>,
        heldBy: Option.Option<string>
      ) {
        if (Array.isReadonlyArrayEmpty(rows)) return
        const scheduledAt = sql`CASE ${notifications.id} ${sql.join(
          Array.map(
            rows,
            (row) =>
              sql`WHEN ${row.id} THEN ${row.until.toISOString()}::timestamptz`
          ),
          sql` `
        )} END`
        yield* db
          .update(notifications)
          .set({
            status: 'pending',
            queuedAt: null,
            deliveryMessageId: null,
            scheduledAt,
          })
          .where(
            and(
              inArray(
                notifications.id,
                Array.map(rows, (row) => row.id)
              ),
              eq(notifications.status, 'queued'),
              Option.match(heldBy, {
                onNone: () => isNull(notifications.deliveryMessageId),
                onSome: (messageId) =>
                  eq(notifications.deliveryMessageId, messageId),
              })
            )
          )
      }),

      claimForDelivery: Effect.fn('NotificationRepository.claimForDelivery')(
        function* (ids: ReadonlyArray<string>, messageId: string) {
          if (ids.length === 0) return []
          const rows = yield* db
            .update(notifications)
            .set({ deliveryMessageId: messageId })
            .where(
              inArray(
                notifications.id,
                lockedInIdOrder(
                  and(
                    inArray(notifications.id, [...ids]),
                    eq(notifications.status, 'queued'),
                    or(
                      isNull(notifications.deliveryMessageId),
                      eq(notifications.deliveryMessageId, messageId)
                    )
                  )
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

      retryLater: Effect.fn('NotificationRepository.retryLater')(function* (
        ids: ReadonlyArray<string>,
        heldBy: string,
        retryAtAfterFailures: Array.NonEmptyReadonlyArray<Date>,
        error: string
      ) {
        if (Array.isReadonlyArrayEmpty(ids)) return []
        const retries = sql`${notifications.retryCount} < ${retryAtAfterFailures.length}`
        const whenRetried = (value: SQL, otherwise: SQL) =>
          sql`CASE WHEN ${retries} THEN ${value} ELSE ${otherwise} END`
        const rows = yield* db
          .update(notifications)
          .set({
            status: whenRetried(
              sql`'pending'::notification_status`,
              sql`'failed'::notification_status`
            ),
            retryCount: sql`${notifications.retryCount} + 1`,
            lastError: error,
            scheduledAt: sql`CASE ${notifications.retryCount} ${sql.join(
              Array.map(
                retryAtAfterFailures,
                (at, attempt) =>
                  sql`WHEN ${attempt} THEN ${at.toISOString()}::timestamptz`
              ),
              sql` `
            )} ELSE ${notifications.scheduledAt} END`,
            queuedAt: whenRetried(sql`NULL`, sql`${notifications.queuedAt}`),
            deliveryMessageId: whenRetried(
              sql`NULL`,
              sql`${notifications.deliveryMessageId}`
            ),
          })
          .where(
            inArray(
              notifications.id,
              lockedInIdOrder(
                and(
                  inArray(notifications.id, [...ids]),
                  eq(notifications.status, 'queued'),
                  eq(notifications.deliveryMessageId, heldBy)
                )
              )
            )
          )
          .returning({
            id: notifications.id,
            status: notifications.status,
            retryCount: notifications.retryCount,
          })
        return Array.map(
          rows,
          (row): FailedAttempt => ({
            id: row.id,
            status: row.status === 'failed' ? 'failed' : 'pending',
            retryCount: row.retryCount,
          })
        )
      }),

      deletePendingByPlantsAndType: Effect.fn(
        'NotificationRepository.deletePendingByPlantsAndType'
      )(function* (plantIds: ReadonlyArray<string>, type: NotificationTopic) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return
        yield* db
          .delete(notifications)
          .where(
            inArray(
              notifications.id,
              lockedInIdOrder(
                and(
                  inArray(notifications.plantId, [...plantIds]),
                  eq(notifications.type, type),
                  eq(notifications.status, 'pending')
                )
              )
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
            inArray(
              notifications.id,
              lockedInIdOrder(
                and(
                  eq(notifications.userId, userId),
                  inArray(notifications.type, [...types]),
                  eq(notifications.status, 'pending')
                )
              )
            )
          )
      }),

      deletePendingByPlantId: Effect.fn(
        'NotificationRepository.deletePendingByPlantId'
      )(function* (plantId: string) {
        yield* db
          .delete(notifications)
          .where(
            inArray(
              notifications.id,
              lockedInIdOrder(
                and(
                  eq(notifications.plantId, plantId),
                  eq(notifications.status, 'pending')
                )
              )
            )
          )
      }),

      deleteUndeliveredByUserAndPlant: Effect.fn(
        'NotificationRepository.deleteUndeliveredByUserAndPlant'
      )(function* (userId: string, plantId: string) {
        yield* db
          .delete(notifications)
          .where(
            inArray(
              notifications.id,
              lockedInIdOrder(
                and(
                  eq(notifications.userId, userId),
                  eq(notifications.plantId, plantId),
                  inArray(notifications.status, ['pending', 'queued'])
                )
              )
            )
          )
      }),

      lockReminderKeys: Effect.fn('NotificationRepository.lockReminderKeys')(
        function* (
          keys: ReadonlyArray<ReminderKey>,
          updatingUserId: Option.Option<string>
        ) {
          if (Array.isReadonlyArrayEmpty(keys)) return
          const values = sql.join(
            Array.map(
              keys,
              (key) => sql`(${key.plantId}::text, ${key.type}::text)`
            ),
            sql`, `
          )
          yield* db.execute(
            sql`SELECT pg_advisory_xact_lock(k1, k2) FROM (SELECT DISTINCT hashtext('reminder:' || v.plant_id) AS k1, hashtext(v.type) AS k2 FROM (VALUES ${values}) AS v(plant_id, type) ORDER BY 1, 2) AS keys`
          )
          const plantIds = Array.dedupe(Array.map(keys, (key) => key.plantId))
          if (Option.isNone(updatingUserId)) {
            yield* lockHoldersOfUndeliveredReminders(plantIds, undefined)
            return
          }
          const userId = updatingUserId.value
          yield* lockHoldersOfUndeliveredReminders(
            plantIds,
            lt(users.id, userId)
          )
          yield* db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .for('no key update')
          yield* lockHoldersOfUndeliveredReminders(
            plantIds,
            gt(users.id, userId)
          )
        }
      ),

      replaceReminders: Effect.fn('NotificationRepository.replaceReminders')(
        function* (replacement: ReminderReplacement) {
          const stale = Array.map(replacement.plants, (plant) =>
            and(
              eq(notifications.plantId, plant.plantId),
              or(
                and(
                  eq(notifications.status, 'pending'),
                  inArray(notifications.type, [...plant.types])
                ),
                and(
                  inArray(notifications.status, ['pending', 'queued']),
                  plant.plantWide
                    ? undefined
                    : inArray(notifications.type, [...plant.types]),
                  Array.isReadonlyArrayNonEmpty(plant.recipientIds)
                    ? notInArray(notifications.userId, [...plant.recipientIds])
                    : undefined
                )
              )
            )
          )
          const replaced = Array.isReadonlyArrayNonEmpty(stale)
            ? yield* db
                .delete(notifications)
                .where(
                  inArray(
                    notifications.id,
                    lockedInIdOrder(
                      and(
                        isNull(notifications.deliveryMessageId),
                        replacement.onlyUserId === null
                          ? undefined
                          : eq(notifications.userId, replacement.onlyUserId),
                        or(...stale)
                      )
                    )
                  )
                )
                .returning({
                  plantId: notifications.plantId,
                  type: notifications.type,
                })
            : []
          const rows = Array.filter(
            replacement.rows,
            (row) =>
              !ReminderGuard.$is('ReplacesUndelivered')(row.guard) ||
              Array.some(
                replaced,
                (r) => r.plantId === row.plantId && r.type === row.type
              )
          )
          if (Array.isReadonlyArrayEmpty(rows)) return
          const values = sql.join(
            Array.map(
              rows,
              (row) =>
                sql`(${row.type}::notification_type, ${row.scheduledAt.toISOString()}::timestamptz, ${row.userId}::uuid, ${row.plantId}::uuid, ${ReminderGuard.$match(
                  row.guard,
                  {
                    Always: () => null,
                    NotRemindedSince: ({ since }) => since.toISOString(),
                    ReplacesUndelivered: () => null,
                  }
                )}::timestamptz)`
            ),
            sql`, `
          )
          yield* db.execute(
            sql`INSERT INTO notifications (type, scheduled_at, user_id, plant_id, status, metadata)
              SELECT v.type, v.scheduled_at, v.user_id, v.plant_id, 'pending'::notification_status, '{}'::jsonb
              FROM (VALUES ${values}) AS v(type, scheduled_at, user_id, plant_id, since)
              WHERE v.since IS NULL OR NOT EXISTS (
                SELECT 1 FROM notifications n
                WHERE n.user_id = v.user_id AND n.plant_id = v.plant_id AND n.type = v.type
                  AND (n.status = 'queued' OR n.delivery_message_id IS NOT NULL OR (n.status = 'sent' AND n.sent_at >= v.since))
              )`
          )
        }
      ),

      deleteUndeliveredForMemberOnCanopy: Effect.fn(
        'NotificationRepository.deleteUndeliveredForMemberOnCanopy'
      )(function* (userId: string, canopyId: string) {
        yield* db
          .delete(notifications)
          .where(
            inArray(
              notifications.id,
              lockedInIdOrder(
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
