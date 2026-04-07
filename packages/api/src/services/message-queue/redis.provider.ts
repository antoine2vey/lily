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
        }).pipe(
          Effect.asVoid,
          Effect.withSpan('Redis.enqueue', {
            attributes: { 'queue.topic': topic },
          })
        ),

      dequeue: (topic) =>
        Effect.tryPromise({
          try: async () => {
            // Move from main queue to processing queue (reliable queue pattern)
            const rawData = await redis.rpoplpush(
              getQueueKey(topic),
              getProcessingKey(topic)
            )
            if (!rawData) return null
            return {
              message: JSON.parse(rawData) as QueueMessage,
              rawData,
            }
          },
          catch: (error) =>
            new QueueOperationError({
              message: `Failed to dequeue message from ${topic}`,
              cause: error,
            }),
        }).pipe(
          Effect.withSpan('Redis.dequeue', {
            attributes: { 'queue.topic': topic },
          })
        ),

      ack: (topic, rawData) =>
        Effect.tryPromise({
          try: () => redis.lrem(getProcessingKey(topic), 1, rawData),
          catch: (error) =>
            new QueueOperationError({
              message: 'Failed to ack message',
              cause: error,
            }),
        }).pipe(
          Effect.asVoid,
          Effect.withSpan('Redis.ack', {
            attributes: { 'queue.topic': topic },
          })
        ),

      nack: (topic, rawData) =>
        Effect.tryPromise({
          try: async () => {
            await redis.lrem(getProcessingKey(topic), 1, rawData)
            await redis.rpush(getQueueKey(topic), rawData)
          },
          catch: (error) =>
            new QueueOperationError({
              message: 'Failed to nack message',
              cause: error,
            }),
        }).pipe(
          Effect.asVoid,
          Effect.withSpan('Redis.nack', {
            attributes: { 'queue.topic': topic },
          })
        ),
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
