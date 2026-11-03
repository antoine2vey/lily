import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type {
  NotificationParamsMap,
  SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import type { LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import type { MetadataOf } from '@lily/shared/notification'
import { type DeferredCareType, MessageQueue } from '@lily/shared/server'
import { Effect, Option, pipe } from 'effect'

interface DeferredCareNotificationParams {
  type: DeferredCareType
  userId: string
  plantId: string
  scheduledAt: Date
}

/**
 * Create a deferred care notification record. Content (title/body) is NOT
 * resolved here — the notification-scheduler will build translated content
 * at delivery time, grouping all plants for the same user into a single push.
 *
 * Use this for care reminder types (watering, fertilization, overdue) where
 * notifications are batched and content depends on the final set of plants.
 */
export const scheduleDeferredCareNotification = (
  params: DeferredCareNotificationParams
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.create({
      type: params.type,
      scheduledAt: params.scheduledAt,
      userId: params.userId,
      plantId: params.plantId,
      metadata: {},
    })
  })

/**
 * Build translated content, create a notification record, and immediately
 * enqueue it for delivery. Uses the recipient's current language so that
 * notifications arrive in the correct locale regardless of when they are sent.
 */
export const scheduleSimpleNotification = <T extends SimpleNotificationType>(
  type: T,
  userId: string,
  params: NotificationParamsMap[T],
  language: LanguageCode,
  metadata: MetadataOf<T>
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const queue = yield* MessageQueue
    const { title, body } = buildSimpleContent(type, params, language)

    const maybeNotification = yield* notificationRepo.create({
      userId,
      type,
      title,
      body,
      scheduledAt: nowAsDate(),
      status: 'queued',
      metadata,
    })

    yield* pipe(
      Option.fromNullishOr(maybeNotification),
      Option.match({
        onNone: () =>
          Effect.logWarning(
            'Notification insert returned no row, skipping enqueue',
            { type, userId }
          ),
        onSome: (notification) => {
          const release = (error: unknown) =>
            Effect.logWarning(
              'Failed to enqueue notification, left for the scheduler',
              { type, userId, error }
            ).pipe(
              Effect.andThen(
                notificationRepo.releaseUnclaimed([notification.id])
              )
            )
          return queue
            .enqueue(type, {
              id: crypto.randomUUID(),
              topic: type,
              payload: {
                userId,
                title,
                body,
                notificationIds: [notification.id],
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
        },
      })
    )
  })
