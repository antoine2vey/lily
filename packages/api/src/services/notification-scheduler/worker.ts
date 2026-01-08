import { DeadLetterRepository } from '@lily/api/repositories/dead-letter.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  MessageQueue,
  type NotificationTopic,
  PushService,
  type QueueMessage,
} from '@lily/shared'
import { Effect, Schedule } from 'effect'

const MAX_RETRIES = 3

// Exponential backoff: 1s -> 2s -> 4s
const workerRetryPolicy = Schedule.exponential('1 second').pipe(
  Schedule.compose(Schedule.recurs(MAX_RETRIES))
)

// Process a single message - send push notification
export const processMessage = (message: QueueMessage) =>
  Effect.gen(function* () {
    const pushService = yield* PushService
    const deviceTokenRepo = yield* DeviceTokenRepository
    const notificationRepo = yield* NotificationRepository

    // Get user's active device tokens
    const tokens = yield* deviceTokenRepo.findByUserId(message.payload.userId)
    const activeTokens = tokens.filter((t) => t.isActive)

    if (activeTokens.length === 0) {
      yield* Effect.logWarning('No active device tokens for user', {
        userId: message.payload.userId,
        notificationId: message.payload.notificationId,
      })
      // Still mark as sent since there's no device to send to
      yield* notificationRepo.markAsSent(message.payload.notificationId)
      return
    }

    // Send to all active devices
    const pushMessages = activeTokens.map((token) => ({
      to: token.token,
      title: message.payload.title,
      body: message.payload.body,
      data: message.payload.data,
      sound: 'default' as const,
    }))

    const results = yield* pushService.sendBatch(pushMessages)

    // Check if any failed
    const failures = results.filter((r) => r.status === 'error')
    if (failures.length > 0) {
      yield* Effect.logWarning('Some push notifications failed', {
        total: results.length,
        failed: failures.length,
      })
    }

    // Mark notification as sent
    yield* notificationRepo.markAsSent(message.payload.notificationId)

    yield* Effect.log('Push notification sent', {
      notificationId: message.payload.notificationId,
      devices: activeTokens.length,
    })
  })

// Handle a message that failed after all retries
export const handleFailedMessage = (message: QueueMessage, error: unknown) =>
  Effect.gen(function* () {
    const deadLetterRepo = yield* DeadLetterRepository
    const notificationRepo = yield* NotificationRepository

    // Add to dead letter queue
    yield* deadLetterRepo.create({
      originalMessageId: message.id,
      topic: message.topic,
      payload: message.payload,
      error: String(error),
      retryCount: message.retryCount,
      userId: message.payload.userId,
      ...(message.payload.plantId ? { plantId: message.payload.plantId } : {}),
    })

    // Mark notification as failed
    yield* notificationRepo.markAsFailed(
      message.payload.notificationId,
      String(error)
    )

    yield* Effect.logError('Message moved to dead letter queue', {
      messageId: message.id,
      notificationId: message.payload.notificationId,
      error: String(error),
    })
  })

// Consume and process messages from a single topic
export const consumeFromTopic = (topic: NotificationTopic) =>
  Effect.gen(function* () {
    const queue = yield* MessageQueue
    const notificationRepo = yield* NotificationRepository

    const message = yield* queue.dequeue(topic)

    if (!message) return

    yield* Effect.log('Processing notification', {
      messageId: message.id,
      topic,
      retryCount: message.retryCount,
    })

    yield* processMessage(message).pipe(
      Effect.retry(workerRetryPolicy),
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          if (message.retryCount >= MAX_RETRIES - 1) {
            // Max retries reached, move to dead letter queue
            yield* handleFailedMessage(message, error)
          } else {
            // Re-enqueue with incremented retry count
            yield* queue.enqueue(topic, {
              ...message,
              retryCount: message.retryCount + 1,
            })
            yield* notificationRepo.incrementRetryCount(
              message.payload.notificationId
            )
            yield* Effect.logWarning('Retrying notification', {
              messageId: message.id,
              retryCount: message.retryCount + 1,
            })
          }
        })
      )
    )

    yield* queue.ack(topic, message.id)
  })

// Start workers for all topics
export const startNotificationWorker = Effect.gen(function* () {
  const topics: NotificationTopic[] = [
    'watering_reminder',
    'fertilization_reminder',
  ]

  // Start a worker for each topic
  for (const topic of topics) {
    yield* Effect.fork(
      Effect.forever(
        consumeFromTopic(topic).pipe(
          Effect.catchAll((error) =>
            Effect.logError(`Worker error for topic ${topic}`, error)
          ),
          // Small delay between polls when queue is empty
          Effect.zipRight(Effect.sleep('100 millis'))
        )
      )
    )
  }

  yield* Effect.log('Notification workers started', { topics })
})
