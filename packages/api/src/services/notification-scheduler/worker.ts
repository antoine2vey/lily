import { DeadLetterRepository } from '@lily/api/repositories/dead-letter.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  MessageQueue,
  NOTIFICATION_TOPICS,
  type NotificationTopic,
  PushService,
  type QueueMessage,
} from '@lily/shared/server'
import {
  Array,
  Effect,
  Either,
  Match,
  Option,
  pipe,
  Schedule,
  Struct,
} from 'effect'

const MAX_RETRIES = 3

// Exponential backoff: 1s -> 2s -> 4s
const workerRetryPolicy = Schedule.exponential('1 second').pipe(
  Schedule.compose(Schedule.recurs(MAX_RETRIES))
)

// Process a single message - send push notification
export const processMessage = (message: QueueMessage) =>
  Effect.gen(function* () {
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

    // Send to all active devices
    const pushMessages = Array.map(activeTokens, (token) => ({
      to: token.token,
      title: message.payload.title,
      body: message.payload.body,
      sound: 'default' as const,
    }))

    const results = yield* pushService.sendBatch(pushMessages)

    // Check if any failed
    const failures = Array.filter(results, (r) => r.status === 'error')
    if (failures.length > 0) {
      yield* Effect.logWarning('Some push notifications failed', {
        total: results.length,
        failed: failures.length,
      })
    }

    // Mark all notifications as sent
    yield* notificationRepo.markManyAsSent(notificationIds)

    yield* Effect.log('Push notification sent', {
      notificationIds,
      devices: activeTokens.length,
    })
  }).pipe(Effect.withSpan('notification-worker.process'))

// Handle a message that failed after all retries
export const handleFailedMessage = (message: QueueMessage, error: unknown) =>
  Effect.gen(function* () {
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
  }).pipe(Effect.withSpan('notification-worker.deadLetter'))

// Consume and process messages from a single topic
export const consumeFromTopic = (topic: NotificationTopic) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan('topic', topic)
    const queue = yield* MessageQueue
    const notificationRepo = yield* NotificationRepository

    const message = yield* queue.dequeue(topic)

    if (!message) return

    yield* Effect.log('Processing notification', {
      messageId: message.id,
      topic,
      retryCount: message.retryCount,
    })

    yield* Effect.either(
      processMessage(message).pipe(Effect.retry(workerRetryPolicy))
    ).pipe(
      Effect.flatMap((result) =>
        Either.match(result, {
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

    yield* queue.ack(topic, message.id)
  }).pipe(Effect.withSpan('notification-worker.consume'))

// Exhaustive topic validation using Effect Match
// Fails at compile time if a topic is not handled, throws at runtime
const validateTopic = Match.type<NotificationTopic>().pipe(
  Match.when('watering_reminder', () => true),
  Match.when('fertilization_reminder', () => true),
  Match.when('overdue_reminder', () => true),
  Match.when('new_follower', () => true),
  Match.when('nudge_to_water', () => true),
  Match.when('delegation_request', () => true),
  Match.when('delegation_accepted', () => true),
  Match.when('delegation_rejected', () => true),
  Match.when('delegation_canceled', () => true),
  Match.when('delegation_activated', () => true),
  Match.when('delegation_completed', () => true),
  Match.when('daily_tip', () => true),
  Match.when('inactivity_nudge', () => true),
  Match.when('photo_reminder', () => true),
  Match.when('plant_parent_milestone', () => true),
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
            SqlError: (error) =>
              Effect.logError(`Worker error for topic ${topic}`, error),
            QueueOperationError: (error) =>
              Effect.logError(`Worker error for topic ${topic}`, error),
          }),
          // Delay between polls when queue is empty
          Effect.zipRight(Effect.sleep('30 seconds'))
        )
      )
    )
  )

  yield* Effect.log('Notification workers started', {
    topics: NOTIFICATION_TOPICS,
  })
})
