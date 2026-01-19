import {
  type IMessageQueue,
  MessageQueue,
  type NotificationTopic,
  QueueConnectionError,
  type QueueMessage,
  QueueOperationError,
} from '@lily/shared/server'
import { Config, Context, Effect, Layer } from 'effect'
import Redis from 'ioredis'

// Redis client service tag
export class RedisClient extends Context.Tag('RedisClient')<
  RedisClient,
  Redis
>() {}

// Key prefix for notification queues
const QUEUE_PREFIX = 'lily:notifications:'
const PROCESSING_SUFFIX = ':processing'

// Get queue key for a topic
const getQueueKey = (topic: NotificationTopic) => `${QUEUE_PREFIX}${topic}`
const getProcessingKey = (topic: NotificationTopic) =>
  `${QUEUE_PREFIX}${topic}${PROCESSING_SUFFIX}`

// Redis implementation of IMessageQueue
export const RedisMessageQueueLive = Layer.effect(
  MessageQueue,
  Effect.gen(function* () {
    const redis = yield* RedisClient

    const queue: IMessageQueue = {
      enqueue: (topic, message) =>
        Effect.tryPromise({
          try: () => redis.lpush(getQueueKey(topic), JSON.stringify(message)),
          catch: (error) =>
            new QueueOperationError({
              message: `Failed to enqueue message to ${topic}`,
              cause: error,
            }),
        }).pipe(Effect.asVoid),

      dequeue: (topic) =>
        Effect.tryPromise({
          try: async () => {
            // Move from main queue to processing queue (reliable queue pattern)
            const data = await redis.rpoplpush(
              getQueueKey(topic),
              getProcessingKey(topic)
            )
            if (!data) return null
            return JSON.parse(data) as QueueMessage
          },
          catch: (error) =>
            new QueueOperationError({
              message: `Failed to dequeue message from ${topic}`,
              cause: error,
            }),
        }),

      ack: (topic, messageId) =>
        Effect.tryPromise({
          try: async () => {
            // Remove message from processing queue by scanning
            const processingKey = getProcessingKey(topic)
            const messages = await redis.lrange(processingKey, 0, -1)
            for (const msg of messages) {
              const parsed = JSON.parse(msg) as QueueMessage
              if (parsed.id === messageId) {
                await redis.lrem(processingKey, 1, msg)
                break
              }
            }
          },
          catch: (error) =>
            new QueueOperationError({
              message: `Failed to ack message ${messageId}`,
              cause: error,
            }),
        }).pipe(Effect.asVoid),

      nack: (topic, messageId) =>
        Effect.tryPromise({
          try: async () => {
            // Move message back to main queue for retry
            const processingKey = getProcessingKey(topic)
            const queueKey = getQueueKey(topic)
            const messages = await redis.lrange(processingKey, 0, -1)
            for (const msg of messages) {
              const parsed = JSON.parse(msg) as QueueMessage
              if (parsed.id === messageId) {
                await redis.lrem(processingKey, 1, msg)
                await redis.rpush(queueKey, msg)
                break
              }
            }
          },
          catch: (error) =>
            new QueueOperationError({
              message: `Failed to nack message ${messageId}`,
              cause: error,
            }),
        }).pipe(Effect.asVoid),
    }

    return queue
  })
)

// Redis client layer
export const RedisClientLive = Layer.scoped(
  RedisClient,
  Effect.gen(function* () {
    const redisUrl = yield* Config.string('REDIS_URL').pipe(
      Config.withDefault('redis://localhost:6379')
    )

    const redis = new Redis(redisUrl)

    // Wait for connection
    yield* Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          redis.once('ready', resolve)
          redis.once('error', reject)
        }),
      catch: (error) =>
        new QueueConnectionError({
          message: 'Failed to connect to Redis',
          cause: error,
        }),
    })

    yield* Effect.log('Connected to Redis', { url: redisUrl })

    // Cleanup on scope close
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        redis.disconnect()
      })
    )

    return redis
  })
)

// Combined layer for Redis message queue
export const RedisMessageQueueFullLive = RedisMessageQueueLive.pipe(
  Layer.provide(RedisClientLive)
)
