import type { SqlError } from '@effect/sql/SqlError'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { DeadLetterRepository } from '@lily/api/repositories/dead-letter.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { Alerter, logAndAlertWarning } from '@lily/api/services/alerting'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import { retireStartTokenForDevice } from '@lily/api/services/live-activity/retire-start-token'
import {
  type InterruptionLevel,
  type LiveActivityAlert,
  type LiveActivityContentState,
  MessageQueue,
  NOTIFICATION_TOPICS,
  type NotificationTopic,
  PushService,
  type QueueMessage,
  TOPIC_CATEGORY,
} from '@lily/shared/server'
import {
  Array,
  Effect,
  Either,
  Match,
  Option,
  pipe,
  Record,
  Schedule,
  Struct,
} from 'effect'

const MAX_RETRIES = 3

// Care reminders are the "do it today or it slips" cluster — we want them to
// pierce Focus/DND on iOS 15+ so the plant actually gets cared for. Everything
// else (social pings, engagement nudges) stays at the default 'active' level.
const resolveInterruptionLevel = (
  topic: NotificationTopic
): InterruptionLevel | undefined =>
  TOPIC_CATEGORY[topic] === 'care' ? 'time-sensitive' : undefined

// Refresh the Live Activity card alongside a care reminder.
//
// Update path is silent — the regular Expo push already showed the banner.
// Start path requires an `alert` (iOS production drops push-to-start without
// one), so the caller passes title/body and we forward them. Users on the
// start path see two banners back-to-back (regular Expo + LA-start);
// consolidating to one is a separate UX change.
//
//   - Active update token → send an `update`.
//   - Else push-to-start token (iOS 17.2+) → send a `start` (creates the card).
//   - Else silently skip.
//
// Failures are logged but never propagate.
const sendLiveActivityForCare = (
  userId: string,
  startAlert: LiveActivityAlert
): Effect.Effect<
  void,
  SqlError,
  | PushService
  | ActivityPushTokenRepository
  | DeviceTokenRepository
  | import('@lily/api/repositories/care-log.repository').CareLogRepository
  | import('@lily/api/repositories/care-schedule.repository').CareScheduleRepository
  | import('@lily/api/repositories/user.repository').UserRepository
> =>
  Effect.gen(function* () {
    const pushService = yield* PushService
    const activityRepo = yield* ActivityPushTokenRepository

    const contentState: LiveActivityContentState | null =
      yield* buildLiveActivityContentState(userId)
    if (!contentState) return

    const activeActivity =
      yield* activityRepo.findActiveActivityByUserId(userId)

    if (activeActivity) {
      const updateResult = yield* pushService
        .sendLiveActivity({
          _tag: 'LiveActivityUpdate',
          to: activeActivity.token,
          contentState,
        })
        .pipe(
          Effect.map(() => 'ok' as const),
          Effect.catchTags({
            PushSendError: (e) =>
              Effect.logWarning('[worker] LA update failed', {
                error: String(e),
              }).pipe(Effect.as('transient-fail' as const)),
            PushConfigError: (e) =>
              Effect.logWarning('[worker] LA update config error', {
                error: String(e),
              }).pipe(Effect.as('transient-fail' as const)),
            // Update token is dead — mark row as ended and fall through to
            // the start-token branch below so a fresh activity is created.
            PushTokenInvalidatedError: (e) =>
              Effect.gen(function* () {
                yield* Effect.logInfo(
                  '[worker] LA update token invalidated — retrying as start',
                  { reason: e.reason }
                )
                if (activeActivity.activityId) {
                  yield* activityRepo.markEnded(activeActivity.activityId)
                }
                return 'token-invalidated' as const
              }),
          })
        )
      if (updateResult !== 'token-invalidated') return
      // else: fall through to start-token path
    }

    const startTokens = yield* activityRepo.findStartTokensByUserId(userId)
    if (Array.isEmptyReadonlyArray(startTokens)) {
      yield* Effect.logInfo('[worker] LA start skipped — no start tokens', {
        userId,
      })
      return
    }

    const activityId = crypto.randomUUID()
    yield* Effect.logInfo('[worker] LA start dispatching', {
      userId,
      activityId,
      startTokenCount: startTokens.length,
    })
    yield* Effect.forEach(
      startTokens,
      (tok) => {
        const logCtx = {
          userId,
          activityId,
          deviceTokenId: tok.deviceTokenId,
        }
        return pushService
          .sendLiveActivity({
            _tag: 'LiveActivityStart',
            to: tok.token,
            attributes: { userId, activityId },
            contentState,
            alert: startAlert,
          })
          .pipe(
            Effect.tap((ticket) =>
              Effect.logInfo('[worker] LA start accepted by APNs', {
                ...logCtx,
                apnsId: ticket.id,
              })
            ),
            Effect.catchTags({
              PushSendError: (e) =>
                Effect.logWarning('[worker] LA start failed', {
                  ...logCtx,
                  error: String(e),
                }),
              PushConfigError: (e) =>
                Effect.logWarning('[worker] LA start config error', {
                  ...logCtx,
                  error: String(e),
                }),
              PushTokenInvalidatedError: (e) =>
                Effect.logWarning(
                  '[worker] LA start-to-push token invalidated',
                  { ...logCtx, reason: e.reason }
                ).pipe(
                  Effect.zipRight(retireStartTokenForDevice(tok.deviceTokenId))
                ),
            }),
            Effect.ignore
          )
      },
      { concurrency: 'unbounded' }
    )
  })

// Exponential backoff: 1s -> 2s -> 4s
const workerRetryPolicy = Schedule.exponential('1 second').pipe(
  Schedule.compose(Schedule.recurs(MAX_RETRIES))
)

// Process a single message - send push notification
export const processMessage = Effect.fn('notification-worker.process')(
  function* (message: QueueMessage) {
    const { notificationIds } = message.payload
    yield* Effect.annotateCurrentSpan('notification.ids', notificationIds)
    yield* Effect.annotateCurrentSpan('userId', message.payload.userId)
    const pushService = yield* PushService
    const deviceTokenRepo = yield* DeviceTokenRepository
    const notificationRepo = yield* NotificationRepository

    // Get user's active device tokens
    const tokens = yield* deviceTokenRepo.findByUserId(message.payload.userId)
    const activeTokens = Array.filter(tokens, (t) => t.isActive)

    if (activeTokens.length === 0) {
      yield* Effect.logWarning('No active device tokens for user', {
        userId: message.payload.userId,
        notificationIds,
      })
      // Still mark as sent since there's no device to send to
      yield* notificationRepo.markManyAsSent(notificationIds)
      return
    }

    // Build data payload for deep linking
    const plantIds = Array.match(message.payload.plantIds, {
      onEmpty: () => Option.none<string>(),
      onNonEmpty: (ids) => Option.some(Array.join(ids, ',')),
    })

    const data: Record<string, unknown> = Record.filter(
      {
        topic: message.topic,
        title: message.payload.title,
        body: message.payload.body,
        plantIds: Option.getOrUndefined(plantIds),
        ...Record.map(message.payload.metadata ?? {}, (v) => v),
      } as Record<string, unknown>,
      (v) => v !== undefined
    )

    const interruptionLevel = resolveInterruptionLevel(message.topic)

    // Send to all active devices
    const pushMessages = Array.map(activeTokens, (token) => ({
      to: token.token,
      title: message.payload.title,
      body: message.payload.body,
      sound: 'default' as const,
      data,
      ...(interruptionLevel ? { interruptionLevel } : {}),
    }))

    const results = yield* pushService.sendBatch(pushMessages)

    // Check if any failed
    const failures = Array.filter(results, (r) => r.status === 'error')
    if (failures.length > 0) {
      const alerter = yield* Alerter
      yield* logAndAlertWarning(
        alerter,
        'notification-worker',
        'Some push notifications failed',
        { total: results.length, failed: failures.length }
      )
    }

    // For care topics on iOS 17.2+ subscribers, refresh the LA card. Updates
    // are silent; starts re-use the regular banner's title/body as the LA
    // alert because production iOS drops alert-less push-to-start. Users on
    // the start path see the banner twice (regular + LA-start) — acceptable
    // for now; consolidating those is a separate UX change.
    if (TOPIC_CATEGORY[message.topic] === 'care') {
      yield* sendLiveActivityForCare(message.payload.userId, {
        title: message.payload.title,
        body: message.payload.body,
        sound: 'default',
      })
    }

    // Mark all notifications as sent
    yield* notificationRepo.markManyAsSent(notificationIds)

    yield* Effect.log('Push notification sent', {
      notificationIds,
      devices: activeTokens.length,
    })
  }
)

// Handle a message that failed after all retries
export const handleFailedMessage = Effect.fn('notification-worker.deadLetter')(
  function* (message: QueueMessage, error: unknown) {
    const { notificationIds } = message.payload
    const deadLetterRepo = yield* DeadLetterRepository
    const notificationRepo = yield* NotificationRepository

    // Add to dead letter queue
    const firstPlantId = pipe(
      Array.head(message.payload.plantIds),
      Option.getOrUndefined
    )

    yield* deadLetterRepo.create({
      originalMessageId: message.id,
      topic: message.topic,
      payload: message.payload,
      error: String(error),
      retryCount: message.retryCount,
      userId: message.payload.userId,
      ...(firstPlantId ? { plantId: firstPlantId } : {}),
    })

    // Mark all notifications as failed
    yield* notificationRepo.markManyAsFailed(notificationIds, String(error))

    yield* Effect.logError('Message moved to dead letter queue', {
      messageId: message.id,
      notificationIds,
      error: String(error),
    })
  }
)

// Consume and process messages from a single topic.
// Returns true when a message was processed (caller should re-poll immediately).
//
// The dequeue poll runs continuously and finds an empty queue most of the time;
// to avoid emitting a span on every idle tick (millions of no-op spans/week),
// the `notification-worker.consume` span is opened only once a message is
// actually dequeued, wrapping the processing work on the hit path.
export const consumeFromTopic = (topic: NotificationTopic) =>
  Effect.gen(function* () {
    const queue = yield* MessageQueue
    const notificationRepo = yield* NotificationRepository

    const result = yield* queue.dequeue(topic)

    if (!result) return false

    const { message, rawData } = result

    const processDequeued = Effect.gen(function* () {
      yield* Effect.log('Processing notification', {
        messageId: message.id,
        topic,
        retryCount: message.retryCount,
      })

      yield* Effect.either(
        processMessage(message).pipe(Effect.retry(workerRetryPolicy))
      ).pipe(
        Effect.flatMap((processResult) =>
          Either.match(processResult, {
            onLeft: (error) =>
              Effect.gen(function* () {
                if (message.retryCount >= MAX_RETRIES - 1) {
                  // Max retries reached, move to dead letter queue
                  yield* handleFailedMessage(message, error)
                } else {
                  // Re-enqueue with incremented retry count
                  yield* queue.enqueue(
                    topic,
                    Struct.evolve(message, { retryCount: (n) => n + 1 })
                  )
                  yield* Effect.forEach(message.payload.notificationIds, (id) =>
                    notificationRepo.incrementRetryCount(id)
                  )
                  yield* Effect.logWarning('Retrying notification', {
                    messageId: message.id,
                    retryCount: message.retryCount + 1,
                  })
                }
              }),
            onRight: () => Effect.void,
          })
        )
      )

      yield* queue.ack(topic, rawData)
    })

    yield* processDequeued.pipe(
      Effect.withSpan('notification-worker.consume', {
        attributes: { topic },
      })
    )

    return true
  })

// Exhaustive topic validation using Effect Match
// Fails at compile time if a topic is not handled, throws at runtime
// Uses whenOr to batch related topics and stay within pipe's 20-argument limit
const validateTopic = Match.type<NotificationTopic>().pipe(
  Match.whenOr(
    'watering_reminder',
    'fertilization_reminder',
    'misting_reminder',
    'repotting_reminder',
    'overdue_reminder',
    () => true
  ),
  Match.whenOr(
    'new_follower',
    'nudge_to_water',
    'delegation_request',
    'delegation_accepted',
    'delegation_rejected',
    'delegation_canceled',
    'delegation_activated',
    'delegation_completed',
    'gift_subscription',
    () => true
  ),
  Match.whenOr(
    'daily_tip',
    'inactivity_nudge',
    'photo_reminder',
    'plant_parent_milestone',
    'resubscribe_nudge',
    () => true
  ),
  Match.whenOr(
    'streak_at_risk',
    'streak_milestone',
    'weekly_recap',
    'trial_ending',
    'approaching_limit',
    'plant_anniversary',
    () => true
  ),
  Match.exhaustive
)

// Start workers for all topics
export const startNotificationWorker = Effect.gen(function* () {
  // Validate all topics are handled at startup (compile + runtime check)
  Array.forEach(NOTIFICATION_TOPICS, validateTopic)

  // Start a worker for each topic
  yield* Effect.forEach(NOTIFICATION_TOPICS, (topic) =>
    Effect.fork(
      Effect.forever(
        consumeFromTopic(topic).pipe(
          Effect.catchTags({
            SqlError: (e: SqlError) =>
              Effect.logError('[notification-worker] SQL error', {
                topic,
                error: String(e),
              }).pipe(Effect.as(false)),
            QueueOperationError: (e) =>
              Effect.logError('[notification-worker] Queue operation error', {
                topic,
                error: String(e),
              }).pipe(Effect.as(false)),
            QueueConnectionError: (e) =>
              Effect.logError('[notification-worker] Queue connection error', {
                topic,
                error: String(e),
              }).pipe(Effect.as(false)),
          }),
          // Only sleep when the queue was empty — drain fast under load
          Effect.flatMap((hadMessage) =>
            hadMessage ? Effect.void : Effect.sleep('5 seconds')
          )
        )
      )
    )
  )

  yield* Effect.log('Notification workers started', {
    topics: NOTIFICATION_TOPICS,
  })
})
