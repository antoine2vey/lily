import {
  lockReminderPlants,
  lockRows,
  lockRowsNamed,
  pinAccounts,
} from '@lily/api/kernel/locks'
import type { Transaction } from '@lily/api/kernel/transact'
import { lockedInIdOrder } from '@lily/api/repositories/helpers/notification-row'
import { withOwner } from '@lily/api/repositories/helpers/plant-owner'
import { isReminderTopic } from '@lily/api/repositories/notification.repository'
import type { PlantRow } from '@lily/api/repositories/plant.repository'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { notifications, plants, users } from '@lily/db/schema'
import { CARE_TOPICS, type DeferredCareType } from '@lily/shared'
import type { NotificationStatus } from '@lily/shared/notification'
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { Array, Context, Effect, Layer } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface ReminderQuery {
  readonly plantIds: ReadonlyArray<string>
  /** Delivered rows are read only when they are about one of these days. */
  readonly occasionDays: ReadonlyArray<string>
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
    readonly type: DeferredCareType
    readonly userId: string
    readonly plantId: string
    readonly scheduledAt: Date
    readonly occasionDay: string
  }>
}

/**
 * The SQL of Reminders: its rows of `notifications`, and the locks a replan
 * takes. Everything but `findPlantIdsOfWaitingReminders`, which picks the
 * plants before the transaction opens, runs inside one.
 */
export class ReminderStore extends Context.Service<
  ReminderStore,
  {
    /**
     * Serializes the planning of each of these plants until the transaction
     * ends. The first lock a replan takes.
     */
    readonly lockReminderPlants: (
      plantIds: ReadonlyArray<string>
    ) => Effect.Effect<void, SqlError, SqlClient.SqlClient | Transaction>
    /** The users who hold a care reminder that is pending or queued on these plants. */
    readonly findHoldersOfWaitingReminders: (
      plantIds: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<string>, SqlError, Transaction>
    /** In id order, each row locked against deletion until the transaction ends. */
    readonly findAccountsForKeyShare: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<
      ReadonlyArray<typeof users.$inferSelect>,
      SqlError,
      Transaction
    >
    readonly findPlantsForKeyShare: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<PlantRow>, SqlError, Transaction>
    /**
     * The care reminders of these plants. Those not yet handed to a worker
     * are locked in id order until the transaction ends.
     */
    readonly lockReminders: (
      query: ReminderQuery
    ) => Effect.Effect<ReadonlyArray<StoredReminder>, SqlError, Transaction>
    readonly writeReminders: (
      writes: ReminderWrites
    ) => Effect.Effect<void, SqlError, Transaction>
    readonly hasOverdueReminderOn: (
      query: OverdueReminderQuery
    ) => Effect.Effect<boolean, SqlError, Transaction>
    /** The plants on which the user holds a care reminder that is pending or queued. */
    readonly findPlantIdsOfWaitingReminders: (
      userId: string
    ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  }
>()('reminders/ReminderStore') {}

export const ReminderStoreLive = Layer.effect(
  ReminderStore,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    return ReminderStore.of({
      lockReminderPlants: (plantIds) =>
        lockReminderPlants(plantIds).pipe(
          Effect.withSpan('ReminderStore.lockReminderPlants')
        ),

      findHoldersOfWaitingReminders: Effect.fn(
        'ReminderStore.findHoldersOfWaitingReminders'
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

      findAccountsForKeyShare: Effect.fn(
        'ReminderStore.findAccountsForKeyShare'
      )(function* (ids: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(ids)) return []
        return yield* pinAccounts(
          db
            .select()
            .from(users)
            .where(inArray(users.id, [...ids]))
        )
      }),

      findPlantsForKeyShare: Effect.fn('ReminderStore.findPlantsForKeyShare')(
        function* (ids: ReadonlyArray<string>) {
          if (Array.isReadonlyArrayEmpty(ids)) return []
          const items = yield* lockRowsNamed(
            'Plant',
            'key share',
            ids,
            db
              .select()
              .from(plants)
              .where(inArray(plants.id, [...ids]))
          )
          return Array.map(items, withOwner)
        }
      ),

      lockReminders: Effect.fn('ReminderStore.lockReminders')(function* (
        query: ReminderQuery
      ) {
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
        const locked = yield* lockRows(
          'Notification',
          'update',
          db
            .select(columns)
            .from(notifications)
            .where(and(ofThePlants, waiting))
        )
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
                  ? inArray(notifications.occasionDay, [...query.occasionDays])
                  : undefined
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
      }),

      writeReminders: Effect.fn('ReminderStore.writeReminders')(function* (
        writes: ReminderWrites
      ) {
        if (Array.isReadonlyArrayNonEmpty(writes.removeIds)) {
          const locked = yield* lockedInIdOrder(
            db,
            and(
              inArray(notifications.id, [...writes.removeIds]),
              inArray(notifications.status, ['pending', 'queued']),
              isNull(notifications.deliveryMessageId)
            )
          )
          yield* db
            .delete(notifications)
            .where(inArray(notifications.id, locked))
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
      }),

      hasOverdueReminderOn: Effect.fn('ReminderStore.hasOverdueReminderOn')(
        function* (query: OverdueReminderQuery) {
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
        }
      ),

      findPlantIdsOfWaitingReminders: Effect.fn(
        'ReminderStore.findPlantIdsOfWaitingReminders'
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
    })
  })
)
