import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { isInDoNotDisturbWindow } from '@lily/api/services/notifications/timezone-scheduler'
import { MessageQueue, type NotificationTopic } from '@lily/shared/server'
import { Array, DateTime, Effect, Match, Option, pipe } from 'effect'

const POLL_INTERVAL = '1 minute'
const BATCH_SIZE = 100

const CARE_REMINDER_TYPES: ReadonlyArray<string> = [
  'watering_reminder',
  'fertilization_reminder',
]

const isCareReminderType = (type: string): boolean =>
  Array.contains(CARE_REMINDER_TYPES, type)

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
  const userRepo = yield* UserRepository
  const queue = yield* MessageQueue

  const pendingNotifications =
    yield* notificationRepo.findPendingToSchedule(BATCH_SIZE)

  if (pendingNotifications.length === 0) return

  yield* Effect.log('Found pending notifications', {
    count: pendingNotifications.length,
  })

  // Batch-fetch all users in a single query
  const uniqueUserIds = pipe(
    Array.map(pendingNotifications, (n) => n.userId),
    Array.dedupe
  )

  const fetchedUsers = yield* userRepo.findByIds(uniqueUserIds)

  const userSettingsMap = new Map(
    Array.map(fetchedUsers, (u) => [u.id, u] as const)
  )

  const currentTime = DateTime.toDateUtc(DateTime.unsafeNow())

  for (const notification of pendingNotifications) {
    const topicOption = mapNotificationTypeToTopic(notification.type)

    if (Option.isNone(topicOption)) {
      yield* Effect.logWarning('Unknown notification type', {
        type: notification.type,
        id: notification.id,
      })
      continue
    }

    const user = userSettingsMap.get(notification.userId) ?? null

    // Safety net: skip care reminders if user has disabled them
    if (isCareReminderType(notification.type) && user && !user.careReminders) {
      yield* Effect.log('Skipping care reminder - user disabled', {
        id: notification.id,
        userId: notification.userId,
      })
      continue
    }

    // Safety net: skip notifications during DND hours
    if (user?.doNotDisturb) {
      const inDnd = yield* isInDoNotDisturbWindow(
        currentTime,
        user.timezone,
        user.doNotDisturbStart,
        user.doNotDisturbEnd
      )

      if (inDnd) {
        yield* Effect.log('Skipping notification - user in DND', {
          id: notification.id,
          userId: notification.userId,
        })
        continue
      }
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
      createdAt: DateTime.toDateUtc(DateTime.unsafeNow()),
      scheduledAt: notification.scheduledAt,
    })

    yield* notificationRepo.markAsQueued(notification.id)

    yield* Effect.log('Enqueued notification', {
      id: notification.id,
      topic,
    })
  }
}).pipe(Effect.withSpan('notification-scheduler.poll'))

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
