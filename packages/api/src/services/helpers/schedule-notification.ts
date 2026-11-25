import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { NotificationDelivery } from '@lily/api/repositories/notification-delivery.repository'
import { MessageQueue } from '@lily/api/services/message-queue/service'
import type {
  QueueConnectionError,
  QueueOperationError,
} from '@lily/api/services/message-queue/types'
import {
  buildSimpleContent,
  type ParamsOf,
  type SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import { NOTIFICATION_PARAMS } from '@lily/api/services/notification-scheduler/translations/params'
import type { LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import type {
  MetadataOf,
  NotificationMetadata,
} from '@lily/shared/notification'
import { Effect, Option, Schema } from 'effect'

export interface RecordedNotification {
  readonly id: string
  readonly type: SimpleNotificationType
  readonly userId: string
  readonly metadata: NotificationMetadata
}

const insertSimpleNotification = <T extends SimpleNotificationType>(
  type: T,
  userId: string,
  params: ParamsOf<T>,
  language: LanguageCode,
  metadata: MetadataOf<T>,
  delivery: {
    readonly status: 'pending' | 'queued'
    readonly scheduledAt: Date
    readonly plantId?: string
    readonly occasionDay?: string
  }
) =>
  Effect.gen(function* () {
    const notifications = yield* NotificationRepository
    const { title, body } = buildSimpleContent(type, params, language)
    // A value its schema rejects still records the row: delivery then sends the
    // stored title and body, so one bad value never stops a scheduler's batch.
    const stored = yield* Schema.encodeUnknownEffect(NOTIFICATION_PARAMS[type])(
      params
    ).pipe(
      Effect.catchTag('SchemaError', (error) =>
        Effect.logWarning('Recording params that do not encode').pipe(
          Effect.annotateLogs({ type, userId, issue: error.message }),
          Effect.as<unknown>(params)
        )
      )
    )
    const row = yield* notifications.create({
      userId,
      type,
      title,
      body,
      params: stored,
      metadata,
      ...delivery,
    })
    return Option.map(
      Option.fromNullishOr(row),
      ({ id }): RecordedNotification => ({ id, type, userId, metadata })
    )
  })

export const recordNotification = <T extends SimpleNotificationType>(
  type: T,
  userId: string,
  params: ParamsOf<T>,
  language: LanguageCode,
  metadata: MetadataOf<T>
) =>
  insertSimpleNotification(type, userId, params, language, metadata, {
    status: 'queued',
    scheduledAt: nowAsDate(),
  }).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.die(new Error(`Notification insert returned no row: ${type}`)),
        onSome: Effect.succeed,
      })
    )
  )

/** False when the user already has the daily tip of `occasionDay`. */
export const recordNotificationAt = <T extends SimpleNotificationType>(
  type: T,
  userId: string,
  params: ParamsOf<T>,
  language: LanguageCode,
  metadata: MetadataOf<T>,
  at: {
    readonly scheduledAt: Date
    readonly plantId?: string
    readonly occasionDay?: string
  }
) =>
  insertSimpleNotification(type, userId, params, language, metadata, {
    status: 'pending',
    ...at,
  }).pipe(Effect.map(Option.isSome))

export const dispatchNow = (notification: RecordedNotification) =>
  Effect.gen(function* () {
    const queue = yield* MessageQueue
    const notifications = yield* NotificationDelivery
    const { id, type, userId, metadata } = notification
    const release = (error: QueueOperationError | QueueConnectionError) =>
      Effect.logWarning(
        'Failed to enqueue notification, left for the scheduler',
        { type, userId, error }
      ).pipe(
        Effect.andThen(notifications.releaseUnclaimed([id])),
        Effect.catchTag('SqlError', (releaseError) =>
          Effect.logWarning(
            'Failed to release notification, left for the recovery sweep',
            { type, userId, error: releaseError }
          )
        )
      )
    yield* queue
      .enqueue({
        id: crypto.randomUUID(),
        topic: type,
        payload: {
          userId,
          notificationIds: [id],
          plantIds: [],
          metadata,
        },
        retryCount: 0,
        createdAt: nowAsDate(),
        scheduledAt: nowAsDate(),
      })
      .pipe(
        Effect.catchTags({
          QueueOperationError: release,
          QueueConnectionError: release,
        })
      )
  })

export const dispatchAll = (
  notifications: ReadonlyArray<RecordedNotification>
) => Effect.forEach(notifications, dispatchNow, { discard: true })
