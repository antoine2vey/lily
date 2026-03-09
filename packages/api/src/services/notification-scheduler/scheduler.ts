import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { buildNotificationContent } from '@lily/api/services/notification-scheduler/translations'
import { isInDoNotDisturbWindow } from '@lily/api/services/notifications/timezone-scheduler'
import type { Notification } from '@lily/shared/notification'
import { MessageQueue, type NotificationTopic } from '@lily/shared/server'
import { Array, DateTime, Effect, Match, Option, pipe, Record } from 'effect'

const POLL_INTERVAL = '1 minute'
const BATCH_SIZE = 100

const CARE_REMINDER_TYPES: ReadonlyArray<string> = [
  'watering_reminder',
  'fertilization_reminder',
  'overdue_reminder',
]

const isCareReminderType = (type: string): boolean =>
  Array.contains(CARE_REMINDER_TYPES, type)

// Map notification type to queue topic using Match
export const mapNotificationTypeToTopic = (
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
    Match.when('overdue_reminder', () =>
      Option.some('overdue_reminder' as const)
    ),
    Match.when('new_follower', () => Option.some('new_follower' as const)),
    Match.when('nudge_to_water', () => Option.some('nudge_to_water' as const)),
    Match.when('delegation_request', () =>
      Option.some('delegation_request' as const)
    ),
    Match.when('delegation_accepted', () =>
      Option.some('delegation_accepted' as const)
    ),
    Match.when('delegation_rejected', () =>
      Option.some('delegation_rejected' as const)
    ),
    Match.when('delegation_canceled', () =>
      Option.some('delegation_canceled' as const)
    ),
    Match.when('delegation_activated', () =>
      Option.some('delegation_activated' as const)
    ),
    Match.when('delegation_completed', () =>
      Option.some('delegation_completed' as const)
    ),
    Match.orElse(() => Option.none())
  )

// Poll database and enqueue pending notifications
export const pollAndEnqueue = Effect.gen(function* () {
  const notificationRepo = yield* NotificationRepository
  const plantRepo = yield* PlantRepository
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

  // Phase 1: Filter valid notifications
  const validNotifications: Notification[] = []

  for (const notification of pendingNotifications) {
    const topicOption = mapNotificationTypeToTopic(notification.type)

    if (Option.isNone(topicOption)) {
      yield* Effect.logWarning('Unknown notification type', {
        type: notification.type,
        id: notification.id,
      })
      continue
    }

    const user = Option.getOrNull(
      Option.fromNullable(userSettingsMap.get(notification.userId))
    )

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

    validNotifications.push(notification)
  }

  if (validNotifications.length === 0) return

  // Phase 2: Group by (userId, type)
  const grouped = Array.groupBy(
    validNotifications,
    (n) => `${n.userId}::${n.type}`
  )

  // Phase 3: Resolve plant names
  const allPlantIds = pipe(
    Array.filterMap(validNotifications, (n) => Option.fromNullable(n.plantId)),
    Array.dedupe
  )

  const plants = yield* plantRepo.findByIds(allPlantIds)

  const plantNameMap = new Map(
    Array.map(plants, (p) => [p.id, p.name] as const)
  )

  // Phase 4: Enqueue one message per group
  for (const [_key, group] of Record.toEntries(grouped)) {
    const first = Array.head(group)
    if (Option.isNone(first)) continue

    const notificationIds = Array.map(group, (n) => n.id)
    const userId = first.value.userId
    const type = first.value.type

    const topicOption = mapNotificationTypeToTopic(type)
    if (Option.isNone(topicOption)) continue
    const topic = topicOption.value

    const plantIds = Array.filterMap(group, (n) =>
      Option.fromNullable(n.plantId)
    )

    const user = userSettingsMap.get(userId)
    const language = Option.getOrElse(
      Option.fromNullable(user?.language),
      () => 'en' as const
    )

    // Care reminders: resolve plant names and build translated content
    // Simple notifications: use pre-built title/body from the DB record
    const { title, body } = isCareReminderType(type)
      ? buildNotificationContent(
          type,
          Array.filterMap(plantIds, (id) =>
            Option.fromNullable(plantNameMap.get(id))
          ),
          language
        )
      : {
          title: Option.getOrElse(
            Option.fromNullable(first.value.title),
            () => ''
          ),
          body: Option.getOrElse(
            Option.fromNullable(first.value.body),
            () => ''
          ),
        }

    yield* queue.enqueue(topic, {
      id: crypto.randomUUID(),
      topic,
      payload: {
        userId,
        title,
        body,
        notificationIds,
        plantIds,
      },
      retryCount: 0,
      createdAt: DateTime.toDateUtc(DateTime.unsafeNow()),
      scheduledAt: first.value.scheduledAt,
    })

    yield* notificationRepo.markManyAsQueued(notificationIds)

    yield* Effect.log('Enqueued grouped notification', {
      notificationIds,
      topic,
      count: group.length,
    })
  }
}).pipe(Effect.withSpan('notification-scheduler.poll'))

// Start the notification scheduler as a background process
export const startNotificationScheduler = Effect.gen(function* () {
  yield* Effect.fork(
    Effect.forever(
      pollAndEnqueue.pipe(
        Effect.catchTags({
          SqlError: (error) =>
            Effect.logError('Scheduler polling error', error),
          QueueOperationError: (error) =>
            Effect.logError('Scheduler polling error', error),
        }),
        Effect.zipRight(Effect.sleep(POLL_INTERVAL))
      )
    )
  )

  yield* Effect.log('Notification scheduler started')
})
