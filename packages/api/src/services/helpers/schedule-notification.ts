import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { mapNotificationTypeToTopic } from '@lily/api/services/notification-scheduler/scheduler'
import type {
  SimpleNotificationParams,
  SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import type { LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import { MessageQueue } from '@lily/shared/server'
import { Effect, Option, pipe } from 'effect'

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
  language: LanguageCode
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
