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
  MetadataOf,
  Notification,
  NotificationStatus,
  NotificationsListResponse,
} from '@lily/shared/notification'
import {
  CARE_TOPICS,
  type DeferredCareType,
  type NotificationTopic,
  TOPIC_CATEGORY,
} from '@lily/shared/server'
import {
  and,
  asc,
  count,
  desc,
  eq,
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
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
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
  params?: unknown
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
  readonly params?: unknown
  /** The day a care or overdue reminder is about. Absent on every other row. */
  readonly occasionDay?: string | undefined
}

export interface SentNotification {
  readonly id: string
  readonly title: string
  readonly body: string
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
  params: Option.getOrUndefined(Option.fromNullishOr(row.params)),
  occasionDay: Option.getOrUndefined(Option.fromNullishOr(row.occasionDay)),
  createdAt: row.createdAt,
})

/** A topic Reminders does not plan. */
export type OtherTopic = Exclude<NotificationTopic, DeferredCareType>

export const isReminderTopic = (
  topic: NotificationTopic
): topic is DeferredCareType => TOPIC_CATEGORY[topic] === 'care'

/** Drops the reminder topics, whose rows only Reminders may write or delete. */
export const exceptReminders = (
  topics: ReadonlyArray<NotificationTopic>
): ReadonlyArray<OtherTopic> =>
  Array.filter(topics, (topic): topic is OtherTopic => !isReminderTopic(topic))

const REMINDER_PLANT_KEYSPACE = 2

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
  readonly create: <T extends OtherTopic>(
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
  readonly deletePendingByUserIdAndTypes: (
    userId: string,
    types: ReadonlyArray<OtherTopic>
  ) => Effect.Effect<void, SqlError>
  /**
   * Serializes the planning of each of these plants until the transaction
   * ends. The first lock a replan takes.
   */
  readonly lockReminderPlants: (
    plantIds: ReadonlyArray<string>
  ) => Effect.Effect<void, SqlError>
  /** The users who hold a care reminder that is pending or queued on these plants. */
  readonly findHoldersOfWaitingReminders: (
    plantIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  /**
   * The care reminders of these plants. Those not yet handed to a worker
   * are locked in id order until the transaction ends.
   */
  readonly lockReminders: (
    query: ReminderQuery
  ) => Effect.Effect<ReadonlyArray<StoredReminder>, SqlError>
  readonly writeReminders: (
    writes: ReminderWrites
  ) => Effect.Effect<void, SqlError>
  readonly hasOverdueReminderOn: (
    query: OverdueReminderQuery
  ) => Effect.Effect<boolean, SqlError>
  /** The plants on which the user holds a care reminder that is pending or queued. */
  readonly findPlantIdsOfWaitingReminders: (
    userId: string
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  /**
   * Deletes what the user is waiting to be told about the Canopy's plants,
   * care reminders aside: those belong to Reminders.
   */
  readonly deleteUndeliveredNonCareForMemberOnCanopy: (
    userId: string,
    canopyId: string
  ) => Effect.Effect<void, SqlError>
  /**
   * Deletes what anyone but the user who owns the plant is waiting to be
   * told about these plants, care reminders aside. For a plant that just
   * moved from a Canopy to a user.
   */
  readonly deleteUndeliveredNonCareOfNonOwners: (
    plantIds: ReadonlyArray<string>
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
  // Batch scheduler methods
  readonly markManyAsSent: (
    rows: ReadonlyArray<SentNotification>
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
export interface ReminderQuery {
  readonly plantIds: ReadonlyArray<string>
  /** Delivered rows are read only when they are about one of these days. */
  readonly occasionDays: ReadonlyArray<string>
  /** Delivered rows with no occasion are read only when sent or scheduled since then. */
  readonly unmarkedSince: Date
}

export interface StoredReminder {
  readonly id: string
  readonly userId: string
  readonly plantId: string
  readonly type: DeferredCareType
  readonly status: NotificationStatus
  readonly inFlight: boolean
  readonly retryCount: number
  readonly scheduledAt: Date
  readonly sentAt: Date | null
  readonly occasionDay: string | null
}

export interface OverdueReminderQuery {
  readonly userId: string
  /** The recipient's calendar day the reminder is about. */
  readonly day: string
  /** The bounds of that day, for a row written before rows recorded their day. */
  readonly from: Date
  readonly until: Date
}

export interface ReminderWrites {
  readonly removeIds: ReadonlyArray<string>
  readonly retimes: ReadonlyArray<{
    readonly id: string
    readonly scheduledAt: Date
    readonly occasionDay: string
  }>
  readonly inserts: ReadonlyArray<{
    readonly type: NotificationTopic
    readonly userId: string
    readonly plantId: string
    readonly scheduledAt: Date
    readonly occasionDay: string
  }>
}

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
        T extends OtherTopic,
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
            params: data.params,
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

      deletePendingByUserIdAndTypes: Effect.fn(
        'NotificationRepository.deletePendingByUserIdAndTypes'
      )(function* (userId: string, types: ReadonlyArray<OtherTopic>) {
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

      lockReminderPlants: Effect.fn(
        'NotificationRepository.lockReminderPlants'
      )(function* (plantIds: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return
        const values = sql.join(
          Array.map(plantIds, (plantId) => sql`(${plantId}::text)`),
          sql`, `
        )
        yield* db.execute(
          sql`SELECT pg_advisory_xact_lock(${REMINDER_PLANT_KEYSPACE}, key) FROM (SELECT DISTINCT hashtext(v.plant_id) AS key FROM (VALUES ${values}) AS v(plant_id) ORDER BY 1) AS keys`
        )
      }),

      findHoldersOfWaitingReminders: Effect.fn(
        'NotificationRepository.findHoldersOfWaitingReminders'
      )(function* (plantIds: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return []
        const rows = yield* db
          .selectDistinct({ userId: notifications.userId })
          .from(notifications)
          .where(
            and(
              inArray(notifications.plantId, [...plantIds]),
              inArray(notifications.type, [...CARE_TOPICS]),
              inArray(notifications.status, ['pending', 'queued'])
            )
          )
        return Array.map(rows, (row) => row.userId)
      }),

      lockReminders: Effect.fn('NotificationRepository.lockReminders')(
        function* (query: ReminderQuery) {
          if (Array.isReadonlyArrayEmpty(query.plantIds)) return []
          const columns = {
            id: notifications.id,
            userId: notifications.userId,
            plantId: notifications.plantId,
            type: notifications.type,
            status: notifications.status,
            deliveryMessageId: notifications.deliveryMessageId,
            retryCount: notifications.retryCount,
            scheduledAt: notifications.scheduledAt,
            sentAt: notifications.sentAt,
            occasionDay: notifications.occasionDay,
          }
          const ofThePlants = and(
            inArray(notifications.plantId, [...query.plantIds]),
            inArray(notifications.type, [...CARE_TOPICS])
          )
          const waiting = and(
            inArray(notifications.status, ['pending', 'queued']),
            isNull(notifications.deliveryMessageId)
          )
          const locked = yield* db
            .select(columns)
            .from(notifications)
            .where(and(ofThePlants, waiting))
            .orderBy(asc(notifications.id))
            .for('update')
          const handedOver = yield* db
            .select(columns)
            .from(notifications)
            .where(
              and(
                ofThePlants,
                Array.isReadonlyArrayNonEmpty(locked)
                  ? notInArray(
                      notifications.id,
                      Array.map(locked, (row) => row.id)
                    )
                  : undefined,
                or(
                  inArray(notifications.status, ['pending', 'queued']),
                  Array.isReadonlyArrayNonEmpty(query.occasionDays)
                    ? inArray(notifications.occasionDay, [
                        ...query.occasionDays,
                      ])
                    : undefined,
                  and(
                    isNull(notifications.occasionDay),
                    sql`coalesce(${notifications.sentAt}, ${notifications.scheduledAt}) >= ${query.unmarkedSince.toISOString()}::timestamptz`
                  )
                )
              )
            )
            .orderBy(asc(notifications.id))
          return Array.flatMap(
            [...locked, ...handedOver],
            ({ deliveryMessageId, plantId, status, type, ...row }) =>
              plantId === null || !isReminderTopic(type)
                ? []
                : [
                    {
                      ...row,
                      plantId,
                      type,
                      status: status as NotificationStatus,
                      inFlight: deliveryMessageId !== null,
                    },
                  ]
          )
        }
      ),

      writeReminders: Effect.fn('NotificationRepository.writeReminders')(
        function* (writes: ReminderWrites) {
          if (Array.isReadonlyArrayNonEmpty(writes.removeIds)) {
            yield* db
              .delete(notifications)
              .where(
                inArray(
                  notifications.id,
                  lockedInIdOrder(
                    and(
                      inArray(notifications.id, [...writes.removeIds]),
                      inArray(notifications.status, ['pending', 'queued']),
                      isNull(notifications.deliveryMessageId)
                    )
                  )
                )
              )
          }
          if (Array.isReadonlyArrayNonEmpty(writes.retimes)) {
            const values = sql.join(
              Array.map(
                writes.retimes,
                (row) =>
                  sql`(${row.id}::uuid, ${row.scheduledAt.toISOString()}::timestamptz, ${row.occasionDay}::date)`
              ),
              sql`, `
            )
            yield* db.execute(
              sql`UPDATE notifications n
                SET scheduled_at = v.scheduled_at, occasion_day = v.occasion_day
                FROM (VALUES ${values}) AS v(id, scheduled_at, occasion_day)
                WHERE n.id = v.id AND n.status = 'pending' AND n.retry_count = 0`
            )
          }
          if (Array.isReadonlyArrayNonEmpty(writes.inserts)) {
            const values = sql.join(
              Array.map(
                writes.inserts,
                (row) =>
                  sql`(${row.type}::notification_type, ${row.scheduledAt.toISOString()}::timestamptz, ${row.userId}::uuid, ${row.plantId}::uuid, ${row.occasionDay}::date)`
              ),
              sql`, `
            )
            yield* db.execute(
              sql`INSERT INTO notifications (type, scheduled_at, user_id, plant_id, occasion_day, status, metadata)
                SELECT v.type, v.scheduled_at, v.user_id, v.plant_id, v.occasion_day, 'pending'::notification_status, '{}'::jsonb
                FROM (VALUES ${values}) AS v(type, scheduled_at, user_id, plant_id, occasion_day)
                ON CONFLICT (user_id, plant_id, type, occasion_day) WHERE occasion_day IS NOT NULL
                DO UPDATE SET scheduled_at = excluded.scheduled_at
                WHERE notifications.status = 'pending' AND notifications.retry_count = 0`
            )
          }
        }
      ),

      hasOverdueReminderOn: Effect.fn(
        'NotificationRepository.hasOverdueReminderOn'
      )(function* (query: OverdueReminderQuery) {
        const rows = yield* db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, query.userId),
              eq(notifications.type, 'overdue_reminder'),
              or(
                eq(notifications.occasionDay, query.day),
                and(
                  isNull(notifications.occasionDay),
                  sql`${notifications.createdAt} >= ${query.from.toISOString()}::timestamptz`,
                  sql`${notifications.createdAt} < ${query.until.toISOString()}::timestamptz`
                )
              )
            )
          )
          .limit(1)
        return Array.isReadonlyArrayNonEmpty(rows)
      }),

      findPlantIdsOfWaitingReminders: Effect.fn(
        'NotificationRepository.findPlantIdsOfWaitingReminders'
      )(function* (userId: string) {
        const rows = yield* db
          .selectDistinct({ plantId: notifications.plantId })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              inArray(notifications.status, ['pending', 'queued']),
              inArray(notifications.type, [...CARE_TOPICS]),
              isNotNull(notifications.plantId)
            )
          )
        return Array.flatMap(rows, ({ plantId }) =>
          plantId === null ? [] : [plantId]
        )
      }),

      deleteUndeliveredNonCareForMemberOnCanopy: Effect.fn(
        'NotificationRepository.deleteUndeliveredNonCareForMemberOnCanopy'
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
                  notInArray(notifications.type, [...CARE_TOPICS]),
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

      deleteUndeliveredNonCareOfNonOwners: Effect.fn(
        'NotificationRepository.deleteUndeliveredNonCareOfNonOwners'
      )(function* (plantIds: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return
        yield* db
          .delete(notifications)
          .where(
            inArray(
              notifications.id,
              lockedInIdOrder(
                and(
                  inArray(notifications.plantId, [...plantIds]),
                  inArray(notifications.status, ['pending', 'queued']),
                  isNull(notifications.deliveryMessageId),
                  notInArray(notifications.type, [...CARE_TOPICS]),
                  notInArray(
                    notifications.plantId,
                    db
                      .select({ id: plants.id })
                      .from(plants)
                      .where(eq(plants.userId, notifications.userId))
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

      // Batch scheduler methods
      markManyAsSent: Effect.fn('NotificationRepository.markManyAsSent')(
        function* (rows: ReadonlyArray<SentNotification>) {
          if (Array.isReadonlyArrayEmpty(rows)) return
          const byId = (column: (row: SentNotification) => string) =>
            sql<string>`CASE ${notifications.id} ${sql.join(
              Array.map(rows, (row) => sql`WHEN ${row.id} THEN ${column(row)}`),
              sql` `
            )} END`
          yield* db
            .update(notifications)
            .set({
              status: 'sent',
              sentAt: nowAsDate(),
              title: byId((row) => row.title),
              body: byId((row) => row.body),
            })
            .where(
              and(
                inArray(
                  notifications.id,
                  Array.map(rows, (row) => row.id)
                ),
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
