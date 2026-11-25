import {
  lockedInIdOrder,
  mapToNotification,
  type NotificationRow,
} from '@lily/api/repositories/helpers/notification-row'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { notifications, plants } from '@lily/db/schema'
import {
  CARE_TOPICS,
  type DeferredCareType,
  type NotificationTopic,
  nowAsDate,
  TOPIC_CATEGORY,
} from '@lily/shared'
import type { MetadataOf, NotificationStatus } from '@lily/shared/notification'
import { and, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

interface CreateNotificationFields {
  title?: string
  body?: string
  params?: unknown
  scheduledAt: Date
  userId: string
  plantId?: string
  /** The user's local day of a daily tip, which holds one per day. */
  occasionDay?: string
  status?: Extract<NotificationStatus, 'pending' | 'queued'>
}

export type CreateNotificationData<
  T extends NotificationTopic = NotificationTopic,
> = {
  [K in T]: CreateNotificationFields & {
    type: K
    metadata: MetadataOf<K>
  }
}[T]

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

export interface INotificationRepository {
  /** Null when the user already has the daily tip of `occasionDay`. */
  readonly create: <T extends OtherTopic>(
    data: CreateNotificationData<T>
  ) => Effect.Effect<NotificationRow | null, SqlError>
  readonly deletePendingByUserIdAndTypes: (
    userId: string,
    types: ReadonlyArray<OtherTopic>
  ) => Effect.Effect<void, SqlError>
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
  /** The user has a notification in the window. */
  readonly hasNotificationIn: (
    window: NotificationWindow
  ) => Effect.Effect<boolean, SqlError>
}

export class NotificationRepository extends Context.Service<
  NotificationRepository,
  INotificationRepository
>()('NotificationRepository') {}

/**
 * `sent` counts the rows delivered in the window, by `sent_at`. `produced`
 * counts the rows recorded in it, by `created_at`, that are pending, queued or
 * sent, so a notification still waiting for its slot counts too.
 */
const COUNTING = {
  sent: { at: notifications.sentAt, statuses: ['sent'] },
  produced: {
    at: notifications.createdAt,
    statuses: ['pending', 'queued', 'sent'],
  },
} as const

export interface NotificationWindow {
  readonly userId: string
  /** Every topic when absent. */
  readonly topics?: Array.NonEmptyReadonlyArray<NotificationTopic>
  readonly plantId?: string
  readonly counting: keyof typeof COUNTING
  /** Instants, computed by the caller in the user's zone. */
  readonly from: Date
  /** Open-ended when absent. */
  readonly until?: Date
}

export const NotificationRepositoryLive = Layer.effect(
  NotificationRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    return {
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
            occasionDay: Option.getOrNull(
              Option.fromNullishOr(data.occasionDay)
            ),
          })
          .onConflictDoNothing({
            target: [notifications.userId, notifications.occasionDay],
            where: sql`${notifications.type} = 'daily_tip' AND ${notifications.occasionDay} IS NOT NULL`,
          })
          .returning()
        return row ? mapToNotification(row) : null
      }),

      deletePendingByUserIdAndTypes: Effect.fn(
        'NotificationRepository.deletePendingByUserIdAndTypes'
      )(function* (userId: string, types: ReadonlyArray<OtherTopic>) {
        if (types.length === 0) return
        const locked = yield* lockedInIdOrder(
          db,
          and(
            eq(notifications.userId, userId),
            inArray(notifications.type, [...types]),
            eq(notifications.status, 'pending')
          )
        )
        yield* db.delete(notifications).where(inArray(notifications.id, locked))
      }),

      deleteUndeliveredNonCareForMemberOnCanopy: Effect.fn(
        'NotificationRepository.deleteUndeliveredNonCareForMemberOnCanopy'
      )(function* (userId: string, canopyId: string) {
        const locked = yield* lockedInIdOrder(
          db,
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
        yield* db.delete(notifications).where(inArray(notifications.id, locked))
      }),

      deleteUndeliveredNonCareOfNonOwners: Effect.fn(
        'NotificationRepository.deleteUndeliveredNonCareOfNonOwners'
      )(function* (plantIds: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return
        const locked = yield* lockedInIdOrder(
          db,
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
        yield* db.delete(notifications).where(inArray(notifications.id, locked))
      }),

      hasNotificationIn: Effect.fn('NotificationRepository.hasNotificationIn')(
        function* (window: NotificationWindow) {
          const { at, statuses } = COUNTING[window.counting]
          const rows = yield* db
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, window.userId),
                window.topics === undefined
                  ? undefined
                  : inArray(notifications.type, [...window.topics]),
                window.plantId === undefined
                  ? undefined
                  : eq(notifications.plantId, window.plantId),
                inArray(notifications.status, [...statuses]),
                gte(at, window.from),
                window.until === undefined ? undefined : lt(at, window.until)
              )
            )
            .limit(1)
          return Array.isReadonlyArrayNonEmpty(rows)
        }
      ),
    }
  })
)
