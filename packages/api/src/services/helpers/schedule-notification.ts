import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { mapNotificationTypeToTopic } from '@lily/api/services/notification-scheduler/scheduler'
import type {
  SimpleNotificationParams,
  SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import type { LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
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
    })
  })

/**
 * Build translated content, create a notification record, and immediately
 * enqueue it for delivery. Uses the recipient's current language so that
 * notifications arrive in the correct locale regardless of when they are sent.
 *
 * Queue failures are logged and swallowed — notifications are a side effect
 * and must not prevent the parent operation (follow, nudge, delegation) from succeeding.
 */
export const scheduleSimpleNotification = (
  type: SimpleNotificationType,
  userId: string,
  params: SimpleNotificationParams,
  language: LanguageCode,
  metadata?: Record<string, string>
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
    })

    yield* pipe(
      Option.fromNullable(maybeNotification),
      Option.match({
        onNone: () =>
          Effect.logWarning(
            'Notification insert returned no row, skipping enqueue',
            { type, userId }
          ),
        onSome: (notification) =>
          Effect.gen(function* () {
            const topic = Option.getOrThrow(mapNotificationTypeToTopic(type))
            yield* queue.enqueue(topic, {
              id: crypto.randomUUID(),
              topic,
              payload: {
                userId,
                title,
                body,
                notificationIds: [notification.id],
                plantIds: [],
                ...(metadata ? { metadata } : {}),
              },
              retryCount: 0,
              createdAt: nowAsDate(),
              scheduledAt: nowAsDate(),
            })
            yield* notificationRepo.markManyAsQueued([notification.id])
          }),
      })
    )
  }).pipe(
    Effect.catchTags({
      QueueOperationError: (error) =>
        Effect.logWarning('Failed to enqueue notification, skipping', {
          type,
          userId,
          error,
        }),
      QueueConnectionError: (error) =>
        Effect.logWarning('Queue unavailable for notification, skipping', {
          type,
          userId,
          error,
        }),
    })
  )
