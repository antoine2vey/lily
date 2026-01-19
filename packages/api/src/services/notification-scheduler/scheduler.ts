import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { MessageQueue, type NotificationTopic } from '@lily/shared/server'
import { Effect, Match, Option, pipe } from 'effect'

const POLL_INTERVAL = '1 minute'
const BATCH_SIZE = 100

// Map notification type to queue topic using Match
const mapNotificationTypeToTopic = (
  type: string
): Option.Option<NotificationTopic> =>
  pipe(
    Match.value(type),
    Match.when('watering_reminder', () =>
      Option.some('watering_reminder' as const)
    ),
    Match.when('fertilization_reminder', () =>
      Option.some('fertilization_reminder' as const)
    ),
    Match.orElse(() => Option.none())
  )

// Poll database and enqueue pending notifications
export const pollAndEnqueue = Effect.gen(function* () {
  const notificationRepo = yield* NotificationRepository
  const queue = yield* MessageQueue

  const pendingNotifications =
    yield* notificationRepo.findPendingToSchedule(BATCH_SIZE)

  if (pendingNotifications.length === 0) return

  yield* Effect.log('Found pending notifications', {
    count: pendingNotifications.length,
  })

  for (const notification of pendingNotifications) {
    const topicOption = mapNotificationTypeToTopic(notification.type)

    if (Option.isNone(topicOption)) {
      yield* Effect.logWarning('Unknown notification type', {
        type: notification.type,
        id: notification.id,
      })
      continue
    }

    const topic = topicOption.value

    yield* queue.enqueue(topic, {
      id: crypto.randomUUID(),
      topic,
      payload: {
        notificationId: notification.id,
        userId: notification.userId,
        plantId: notification.plantId,
        title: notification.title,
        body: notification.body,
      },
      retryCount: 0,
      createdAt: new Date(),
      scheduledAt: notification.scheduledAt,
    })

    yield* notificationRepo.markAsQueued(notification.id)

    yield* Effect.log('Enqueued notification', {
      id: notification.id,
      topic,
    })
  }
})

// Start the notification scheduler as a background process
export const startNotificationScheduler = Effect.gen(function* () {
  yield* Effect.fork(
    Effect.forever(
      pollAndEnqueue.pipe(
        Effect.catchAll((error) =>
          Effect.logError('Scheduler polling error', error)
        ),
        Effect.zipRight(Effect.sleep(POLL_INTERVAL))
      )
    )
  )

  yield* Effect.log('Notification scheduler started')
})
