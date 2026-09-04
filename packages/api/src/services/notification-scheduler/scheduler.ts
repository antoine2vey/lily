import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { createDrainableScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  buildCareDigestContent,
  buildGroupedPlantAnniversaryContent,
  type CareDigestItem,
  pickDominantCareTopic,
} from '@lily/api/services/notification-scheduler/translations'
import { isInDoNotDisturbWindow } from '@lily/api/services/notifications/timezone-scheduler'
import { isOnVacation } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import {
  type DeferredCareType,
  MessageQueue,
  type NotificationTopic,
  TOPIC_CATEGORY,
} from '@lily/shared/server'
import { Array, DateTime, Effect, Option, pipe, Record } from 'effect'

const BATCH_SIZE = 100

const isCareReminderType = (
  type: NotificationTopic
): type is DeferredCareType => TOPIC_CATEGORY[type] === 'care'

const isEngagementType = (type: NotificationTopic): boolean =>
  TOPIC_CATEGORY[type] === 'engagement'

// Map notification type string from DB to a typed NotificationTopic.
// Returns Option.none() for unknown strings (DB column is untyped text).
// Compile-time exhaustiveness is enforced by TOPIC_CATEGORY in shared,
// not here — this is purely a runtime string→union boundary guard.
// Uses O(1) hasOwnProperty on TOPIC_CATEGORY instead of linear array scan.
export const mapNotificationTypeToTopic = (
  type: string
): Option.Option<NotificationTopic> =>
  type in TOPIC_CATEGORY
    ? Option.some(type as NotificationTopic)
    : Option.none()

// Poll database and enqueue pending notifications.
// Returns true when a full batch was found (more rows likely waiting).
export const pollAndEnqueue = Effect.gen(function* () {
  const notificationRepo = yield* NotificationRepository
  const plantRepo = yield* PlantRepository
  const userRepo = yield* UserRepository
  const queue = yield* MessageQueue

  const pendingNotifications =
    yield* notificationRepo.findPendingToSchedule(BATCH_SIZE)

  if (pendingNotifications.length === 0) return false

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

  // Phase 1: Filter valid notifications and resolve topics
  type ValidNotification = {
    notification: Notification
    topic: NotificationTopic
  }
  const validNotifications: ValidNotification[] = []

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

    const user = Option.getOrNull(
      Option.fromNullable(userSettingsMap.get(notification.userId))
    )

    // Safety net: skip care reminders if user has disabled them
    if (isCareReminderType(topic) && user && !user.careReminders) {
      yield* Effect.log('Skipping care reminder - user disabled', {
        id: notification.id,
        userId: notification.userId,
      })
      continue
    }

    // Safety net: skip engagement notifications if user has disabled tips
    if (isEngagementType(topic) && user && !user.tips) {
      yield* Effect.log(
        'Skipping engagement notification - user disabled tips',
        {
          id: notification.id,
          userId: notification.userId,
        }
      )
      continue
    }

    // Safety net: skip care/engagement notifications while the recipient is
    // on vacation (social topics still go out — e.g. delegation responses)
    if (
      user &&
      TOPIC_CATEGORY[topic] !== 'social' &&
      isOnVacation(user, currentTime)
    ) {
      yield* Effect.log('Skipping notification - user on vacation', {
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

    validNotifications.push({ notification, topic })
  }

  if (validNotifications.length === 0) return false

  // Phase 2: Group by user. Care reminders merge across care types (and
  // plants) into one push per user per batch — a plant due for watering AND
  // misting must not produce two banners, and the Live Activity refresh that
  // follows each care push is per-user anyway. Everything else keeps the
  // (userId, type) key.
  const grouped = Array.groupBy(validNotifications, (n) =>
    isCareReminderType(n.topic)
      ? `${n.notification.userId}::care`
      : `${n.notification.userId}::${n.notification.type}`
  )

  // Phase 3: Resolve plant names
  const allPlantIds = pipe(
    Array.filterMap(validNotifications, (n) =>
      Option.fromNullable(n.notification.plantId)
    ),
    Array.dedupe
  )

  const plants = yield* plantRepo.findByIds(allPlantIds)

  const plantNameMap = new Map(
    Array.map(plants, (p) => [p.id, p.name] as const)
  )

  // Phase 4: Enqueue one message per group (concurrently)
  yield* Effect.forEach(
    Record.toEntries(grouped),
    ([_key, group]) =>
      Effect.gen(function* () {
        const first = Array.head(group)
        if (Option.isNone(first)) return

        const notificationIds = Array.map(group, (n) => n.notification.id)
        const userId = first.value.notification.userId

        // Deduped: a plant due for two care types contributes one id, so the
        // app's single-plant deep link still resolves.
        const plantIds = pipe(
          Array.filterMap(group, (n) =>
            Option.fromNullable(n.notification.plantId)
          ),
          Array.dedupe
        )

        // Care groups span several topics; route the merged message on the
        // most urgent one (overdue > watering > ...). All care topics share
        // the same app deep link and interruption level, so the choice only
        // affects which queue partition carries it.
        const careTopics = Array.filterMap(group, (n) =>
          isCareReminderType(n.topic) ? Option.some(n.topic) : Option.none()
        )
        const topic: NotificationTopic = Array.match(careTopics, {
          onEmpty: () => first.value.topic,
          onNonEmpty: (types) => pickDominantCareTopic(types),
        })

        const user = userSettingsMap.get(userId)
        const language = Option.getOrElse(
          Option.fromNullable(user?.language),
          () => 'en' as const
        )

        // Resolve per-group plant names once for content builders that need them.
        const groupPlantNames = Array.filterMap(plantIds, (id) =>
          Option.fromNullable(plantNameMap.get(id))
        )

        // Fall back to the title/body persisted on the first notification row.
        // Used by simple single-plant notifications (e.g. a lone anniversary).
        const passthroughContent = {
          title: Option.getOrElse(
            Option.fromNullable(first.value.notification.title),
            () => ''
          ),
          body: Option.getOrElse(
            Option.fromNullable(first.value.notification.body),
            () => ''
          ),
        }

        // Non-care content: grouped birthday when >1 plant anniversaries land
        // in the same group, otherwise pass through the DB row as-is.
        const resolveNonCareContent = (): { title: string; body: string } =>
          topic === 'plant_anniversary' && group.length > 1
            ? buildGroupedPlantAnniversaryContent(groupPlantNames, language)
            : passthroughContent

        // Care reminders: one digest item per plant carrying every care type
        // due for it. Rows whose plant has no resolvable name are dropped from
        // the body (same as the old groupPlantNames behaviour).
        const careItems: CareDigestItem[] = pipe(
          Array.filterMap(group, ({ notification, topic: rowTopic }) => {
            if (!isCareReminderType(rowTopic)) return Option.none()
            const careType: DeferredCareType = rowTopic
            return pipe(
              Option.fromNullable(notification.plantId),
              Option.flatMap((plantId) =>
                pipe(
                  Option.fromNullable(plantNameMap.get(plantId)),
                  Option.map((plantName) => ({ plantId, plantName, careType }))
                )
              )
            )
          }),
          Array.groupBy((r) => r.plantId),
          Record.values,
          Array.map((rows) => ({
            plantName: Array.headNonEmpty(rows).plantName,
            careTypes: Array.map(rows, (r) => r.careType),
          }))
        )

        const { title, body } = Array.match(careItems, {
          onEmpty: resolveNonCareContent,
          onNonEmpty: (items) => buildCareDigestContent(items, language),
        })

        yield* queue.enqueue(topic, {
          id: crypto.randomUUID(),
          topic,
          payload: {
            userId,
            title,
            body,
            notificationIds,
            plantIds,
            language,
          },
          retryCount: 0,
          createdAt: DateTime.toDateUtc(DateTime.unsafeNow()),
          scheduledAt: first.value.notification.scheduledAt,
        })

        yield* Effect.if(isCareReminderType(topic), {
          onTrue: () =>
            notificationRepo.markManyAsQueuedWithContent(
              notificationIds,
              title,
              body
            ),
          onFalse: () => notificationRepo.markManyAsQueued(notificationIds),
        })

        yield* Effect.log('[notification-scheduler] Enqueued group', {
          notificationIds,
          topic,
          count: group.length,
        })
      }).pipe(
        Effect.catchTags({
          SqlError: (e) =>
            Effect.logWarning(
              '[notification-scheduler] Failed to enqueue group',
              { error: String(e) }
            ),
          QueueOperationError: (e) =>
            Effect.logWarning(
              '[notification-scheduler] Queue operation failed',
              {
                error: String(e),
              }
            ),
          QueueConnectionError: (e) =>
            Effect.logWarning(
              '[notification-scheduler] Queue connection failed',
              { error: String(e) }
            ),
        })
      ),
    { concurrency: 10 }
  )

  // Signal whether there are likely more rows waiting
  return pendingNotifications.length >= BATCH_SIZE
}).pipe(Effect.withSpan('notification-scheduler.poll'))

export const startNotificationScheduler = createDrainableScheduler({
  name: 'notification-scheduler',
  interval: '1 minute',
  runOnStartup: false,
  task: pollAndEnqueue,
})
