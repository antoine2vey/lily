import {
  type DeferredNotification,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { createDrainableScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  DEFER_MESSAGE,
  Decision,
  DROP_MESSAGE,
  decide,
  loadPlantFacts,
  loadRecipients,
} from '@lily/api/services/notification-scheduler/dispatch-gate'
import {
  buildCareDigestContent,
  buildGroupedPlantAnniversaryContent,
  type CareDigestItem,
  pickDominantCareTopic,
} from '@lily/api/services/notification-scheduler/translations'
import {
  NOTIFICATION_METADATA,
  type Notification,
  type NotificationMetadata,
} from '@lily/shared/notification'
import {
  type DeferredCareType,
  MessageQueue,
  type NotificationTopic,
  TOPIC_CATEGORY,
} from '@lily/shared/server'
import {
  Array,
  DateTime,
  Effect,
  Filter,
  Option,
  pipe,
  Record,
  Result,
  Schema,
  String as Str,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const BATCH_SIZE = 100

const isCareReminderType = (
  type: NotificationTopic
): type is DeferredCareType => TOPIC_CATEGORY[type] === 'care'

const decodeMetadata = (topic: NotificationTopic, metadata: unknown) =>
  Schema.decodeUnknownResult(Schema.UndefinedOr(NOTIFICATION_METADATA[topic]))(
    metadata
  )

// Returns true when a full batch was found (more rows likely waiting).
export const pollAndEnqueue = Effect.gen(function* () {
  const notificationRepo = yield* NotificationRepository
  const plantRepo = yield* PlantRepository
  const userRepo = yield* UserRepository
  const queue = yield* MessageQueue

  const pendingNotifications =
    yield* notificationRepo.claimPendingToSchedule(BATCH_SIZE)

  if (pendingNotifications.length === 0) return false

  const filledBatch = pendingNotifications.length >= BATCH_SIZE

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

  const recipients = yield* loadRecipients(fetchedUsers, currentTime)

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
  const plantFacts = yield* loadPlantFacts(plants)

  // Phase 1: Filter valid notifications and resolve topics
  type ValidNotification = {
    notification: Notification
    topic: NotificationTopic
    metadata: NotificationMetadata | undefined
  }
  const validNotifications: ValidNotification[] = []
  const dropIds: string[] = []
  const deferred: DeferredNotification[] = []

  for (const notification of pendingNotifications) {
    const topic = notification.type
    const metadata = decodeMetadata(topic, notification.metadata)

    if (Result.isFailure(metadata)) {
      yield* Effect.logWarning('Dropping notification - malformed metadata', {
        type: topic,
        id: notification.id,
        error: Str.replace(/\n\s*/g, ' ')(metadata.failure.message),
      })
      dropIds.push(notification.id)
      continue
    }

    const decision = decide(
      notification,
      Option.fromNullishOr(recipients.get(notification.userId)),
      plantFacts,
      currentTime
    )
    const logged = { id: notification.id, userId: notification.userId }
    yield* Decision.$match(decision, {
      Send: () =>
        Effect.sync(() =>
          validNotifications.push({
            notification,
            topic,
            metadata: metadata.success,
          })
        ),
      Drop: ({ reason }) => {
        dropIds.push(notification.id)
        return Effect.log(DROP_MESSAGE[reason], logged)
      },
      Defer: ({ reason, until }) => {
        deferred.push({ id: notification.id, until })
        return Effect.log(DEFER_MESSAGE[reason], { ...logged, until })
      },
    })
  }

  yield* notificationRepo.deleteByIds(dropIds)
  yield* notificationRepo.deferUntil(deferred, Option.none())

  if (validNotifications.length === 0) return filledBatch

  const batchKey = ({ notification, topic }: ValidNotification) => {
    if (isCareReminderType(topic)) return `${notification.userId}::care`
    if (topic === 'plant_anniversary') {
      return `${notification.userId}::plant_anniversary`
    }
    return `${notification.userId}::${notification.id}`
  }
  const grouped = Array.groupBy(validNotifications, batchKey)

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

        const { metadata } = first.value
        const { userId } = first.value.notification

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
          .enqueue({
            id: crypto.randomUUID(),
            topic,
            payload: {
              userId,
              title,
              body,
              notificationIds,
              plantIds,
              language,
              ...Option.match(Option.fromNullishOr(metadata), {
                onNone: () => ({}),
                onSome: (value) => ({ metadata: value }),
              }),
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
  return filledBatch
}).pipe(Effect.withSpan('notification-scheduler.poll'))

export const startNotificationScheduler = createDrainableScheduler({
  name: 'notification-scheduler',
  interval: '1 minute',
  runOnStartup: false,
  task: pollAndEnqueue,
})
