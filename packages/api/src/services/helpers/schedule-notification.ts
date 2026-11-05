import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type {
  ParamsOf,
  SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import type { LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import type {
  MetadataOf,
  NotificationMetadata,
} from '@lily/shared/notification'
import {
  type DeferredCareType,
  MessageQueue,
  type QueueConnectionError,
  type QueueOperationError,
} from '@lily/shared/server'
import { Effect, Option } from 'effect'

interface DeferredCareNotificationParams {
  type: DeferredCareType
  userId: string
  plantId: string
  scheduledAt: Date
}

export const scheduleDeferredCareNotification = (
  params: DeferredCareNotificationParams
) =>
  Effect.gen(function* () {
    const notifications = yield* NotificationRepository
    yield* notifications.create({
      type: params.type,
      scheduledAt: params.scheduledAt,
      userId: params.userId,
      plantId: params.plantId,
      metadata: {},
    })
  })

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
  metadata: MetadataOf<T>,
  delivery: {
    readonly status: 'pending' | 'queued'
    readonly scheduledAt: Date
    readonly plantId?: string
  }
) =>
  Effect.gen(function* () {
    const notifications = yield* NotificationRepository
    const row = yield* notifications.create({
      userId,
      type,
      params,
      metadata,
      ...delivery,
    })
    return yield* Option.match(Option.fromNullishOr(row), {
      onNone: () =>
        Effect.die(new Error(`Notification insert returned no row: ${type}`)),
      onSome: ({ id }) =>
        Effect.succeed<RecordedNotification>({
          id,
          type,
          userId,
          metadata,
        }),
    })
  })

export const recordNotification = <T extends SimpleNotificationType>(
  type: T,
  userId: string,
  params: ParamsOf<T>,
  _language: LanguageCode,
  metadata: MetadataOf<T>
) =>
  insertSimpleNotification(type, userId, params, metadata, {
    status: 'queued',
    scheduledAt: nowAsDate(),
  })

export const recordNotificationAt = <T extends SimpleNotificationType>(
  type: T,
  userId: string,
  params: ParamsOf<T>,
  _language: LanguageCode,
  metadata: MetadataOf<T>,
  at: { readonly scheduledAt: Date; readonly plantId?: string }
) =>
  insertSimpleNotification(type, userId, params, metadata, {
    status: 'pending',
    ...at,
  }).pipe(Effect.asVoid)

export const dispatchNow = (notification: RecordedNotification) =>
  Effect.gen(function* () {
    const queue = yield* MessageQueue
    const notifications = yield* NotificationRepository
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
