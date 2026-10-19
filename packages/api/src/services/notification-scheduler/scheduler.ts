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
import { Array, DateTime, Effect, Filter, Option, pipe, Record } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

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

// Returns true when a full batch was found (more rows likely waiting).
export const pollAndEnqueue = Effect.gen(function* () {
  const notificationRepo = yield* NotificationRepository
  const plantRepo = yield* PlantRepository
  const userRepo = yield* UserRepository
  const queue = yield* MessageQueue

  const pendingNotifications =
    yield* notificationRepo.claimPendingToSchedule(BATCH_SIZE)

  if (pendingNotifications.length === 0) return false

  yield* Effect.log('Claimed due notifications', {
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

  const currentTime = DateTime.toDateUtc(DateTime.nowUnsafe())

  // Batch-fetch every referenced plant up front: Phase 1 needs it to drop
  // reminders for plants that died since the row was scheduled, and Phase 3
  // reuses it for names.
  const allPlantIds = pipe(
    Array.filterMap(
      pendingNotifications,
      Filter.fromPredicateOption((n) => Option.fromNullishOr(n.plantId))
    ),
    Array.dedupe
  )
  const plants = yield* plantRepo.findByIds(allPlantIds)
  const livingPlantIds = new Set(
    Array.filterMap(
      plants,
      Filter.fromPredicateOption((p) =>
        p.diedAt === null ? Option.some(p.id) : Option.none()
      )
    )
  )

  // Phase 1: Filter valid notifications and resolve topics
  type ValidNotification = {
    notification: Notification
    topic: NotificationTopic
  }
  const validNotifications: ValidNotification[] = []
  const dropIds: string[] = []
  const deferIds: string[] = []

  for (const notification of pendingNotifications) {
    const plantIdOpt = Option.fromNullishOr(notification.plantId)
    if (Option.isSome(plantIdOpt) && !livingPlantIds.has(plantIdOpt.value)) {
      yield* Effect.log('Dropping notification - plant dead or missing', {
        id: notification.id,
        plantId: notification.plantId,
      })
      dropIds.push(notification.id)
      continue
    }

    const topicOption = mapNotificationTypeToTopic(notification.type)

    if (Option.isNone(topicOption)) {
      yield* Effect.logWarning('Dropping notification - unknown type', {
        type: notification.type,
        id: notification.id,
      })
      dropIds.push(notification.id)
      continue
    }

    const topic = topicOption.value

    const user = Option.getOrNull(
      Option.fromNullishOr(userSettingsMap.get(notification.userId))
    )

    if (isCareReminderType(topic) && user && !user.careReminders) {
      yield* Effect.log('Dropping care reminder - user disabled', {
        id: notification.id,
        userId: notification.userId,
      })
      dropIds.push(notification.id)
      continue
    }

    if (isEngagementType(topic) && user && !user.tips) {
      yield* Effect.log(
        'Dropping engagement notification - user disabled tips',
        {
          id: notification.id,
          userId: notification.userId,
        }
      )
      dropIds.push(notification.id)
      continue
    }

    if (
      user &&
      TOPIC_CATEGORY[topic] !== 'social' &&
      isOnVacation(user, currentTime)
    ) {
      yield* Effect.log('Deferring notification - user on vacation', {
        id: notification.id,
        userId: notification.userId,
      })
      deferIds.push(notification.id)
      continue
    }

    if (user?.doNotDisturb) {
      const inDnd = yield* isInDoNotDisturbWindow(
        currentTime,
        user.timezone,
        user.doNotDisturbStart,
        user.doNotDisturbEnd
      )

      if (inDnd) {
        yield* Effect.log('Deferring notification - user in DND', {
          id: notification.id,
          userId: notification.userId,
        })
        deferIds.push(notification.id)
        continue
      }
    }

    validNotifications.push({ notification, topic })
  }

  yield* notificationRepo.deleteByIds(dropIds)
  yield* notificationRepo.releaseUnclaimed(deferIds)

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

  // Phase 3: Resolve plant names (from the batch fetched before Phase 1)
  const plantNameMap = new Map(
    Array.map(plants, (p) => [p.id, p.name] as const)
  )

  // Phase 4: Enqueue one message per group (concurrently)
  yield* Effect.forEach(
    Record.toEntries(grouped),
    ([_key, group]) => {
      const notificationIds = Array.map(group, (n) => n.notification.id)
      const releaseGroupAfterSqlError = (error: SqlError) =>
        Effect.logWarning('[notification-scheduler] Failed to enqueue group', {
          notificationIds,
          error: String(error),
        }).pipe(
          Effect.andThen(notificationRepo.releaseUnclaimed(notificationIds)),
          Effect.catchTag('SqlError', (releaseError) =>
            Effect.logWarning(
              '[notification-scheduler] Group left queued for the recovery sweep',
              { notificationIds, error: String(releaseError) }
            )
          )
        )
      return Effect.gen(function* () {
        const first = Array.head(group)
        if (Option.isNone(first)) return

        const userId = first.value.notification.userId

        // Deduped: a plant due for two care types contributes one id, so the
        // app's single-plant deep link still resolves.
        const plantIds = pipe(
          Array.filterMap(
            group,
            Filter.fromPredicateOption((n) =>
              Option.fromNullishOr(n.notification.plantId)
            )
          ),
          Array.dedupe
        )

        // Care groups span several topics; route the merged message on the
        // most urgent one (overdue > watering > ...). All care topics share
        // the same app deep link and interruption level, so the choice only
        // affects which queue partition carries it.
        const careTopics = Array.filterMap(
          group,
          Filter.fromPredicateOption((n) =>
            isCareReminderType(n.topic) ? Option.some(n.topic) : Option.none()
          )
        )
        const topic: NotificationTopic = Array.match(careTopics, {
          onEmpty: () => first.value.topic,
          onNonEmpty: (types) => pickDominantCareTopic(types),
        })

        const user = userSettingsMap.get(userId)
        const language = Option.getOrElse(
          Option.fromNullishOr(user?.language),
          () => 'en' as const
        )

        // Resolve per-group plant names once for content builders that need them.
        const groupPlantNames = Array.filterMap(
          plantIds,
          Filter.fromPredicateOption((id) =>
            Option.fromNullishOr(plantNameMap.get(id))
          )
        )

        // Fall back to the title/body persisted on the first notification row.
        // Used by simple single-plant notifications (e.g. a lone anniversary).
        const passthroughContent = {
          title: Option.getOrElse(
            Option.fromNullishOr(first.value.notification.title),
            () => ''
          ),
          body: Option.getOrElse(
            Option.fromNullishOr(first.value.notification.body),
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
          Array.filterMap(
            group,
            Filter.fromPredicateOption(({ notification, topic: rowTopic }) => {
              if (!isCareReminderType(rowTopic)) return Option.none()
              const careType: DeferredCareType = rowTopic
              return pipe(
                Option.fromNullishOr(notification.plantId),
                Option.flatMap((plantId) =>
                  pipe(
                    Option.fromNullishOr(plantNameMap.get(plantId)),
                    Option.map((plantName) => ({
                      plantId,
                      plantName,
                      careType,
                    }))
                  )
                )
              )
            })
          ),
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

        if (isCareReminderType(topic)) {
          yield* notificationRepo.setQueuedContent(notificationIds, title, body)
        }

        const releaseGroup = (error: unknown) =>
          Effect.logWarning(
            '[notification-scheduler] Enqueue failed, released group',
            { notificationIds, topic, error: String(error) }
          ).pipe(
            Effect.andThen(notificationRepo.releaseUnclaimed(notificationIds)),
            Effect.as(false)
          )

        const enqueued = yield* queue
          .enqueue(topic, {
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
            createdAt: DateTime.toDateUtc(DateTime.nowUnsafe()),
            scheduledAt: first.value.notification.scheduledAt,
          })
          .pipe(
            Effect.as(true),
            Effect.catchTags({
              QueueOperationError: releaseGroup,
              QueueConnectionError: releaseGroup,
            })
          )

        if (enqueued) {
          yield* Effect.log('[notification-scheduler] Enqueued group', {
            notificationIds,
            topic,
            count: group.length,
          })
        }
      }).pipe(Effect.catchTag('SqlError', releaseGroupAfterSqlError))
    },
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
