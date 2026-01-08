import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { MessageQueue, type NotificationTopic } from '@lily/shared'
import { Effect } from 'effect'

const POLL_INTERVAL = '1 minute'
const BATCH_SIZE = 100

// Map notification type to queue topic
const mapNotificationTypeToTopic = (type: string): NotificationTopic | null => {
  switch (type) {
    case 'watering_reminder':
      return 'watering_reminder'
    case 'fertilization_reminder':
      return 'fertilization_reminder'
    default:
      return null
  }
}

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
    const topic = mapNotificationTypeToTopic(notification.type)

    if (!topic) {
      yield* Effect.logWarning('Unknown notification type', {
        type: notification.type,
        id: notification.id,
      })
      continue
    }

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
