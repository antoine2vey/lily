import {
  type IMessageQueue,
  MessageQueue,
  type NotificationTopic,
  QueueConnectionError,
  type QueueMessage,
  QueueOperationError,
} from '@lily/shared/server'
import { Config, Context, Duration, Effect, Layer } from 'effect'
import Redis from 'ioredis'

// Redis client service tag
export class RedisClient extends Context.Service<RedisClient, Redis>()(
  'RedisClient'
) {}

// Key prefix for notification queues
const QUEUE_PREFIX = 'lily:notifications:'
const PROCESSING_SUFFIX = ':processing'
const CLAIMED_SUFFIX = ':processing:claimed'

// Get queue key for a topic
const getQueueKey = (topic: NotificationTopic) => `${QUEUE_PREFIX}${topic}`
const getProcessingKey = (topic: NotificationTopic) =>
  `${QUEUE_PREFIX}${topic}${PROCESSING_SUFFIX}`
const getClaimedKey = (topic: NotificationTopic) =>
  `${QUEUE_PREFIX}${topic}${CLAIMED_SUFFIX}`

const evalTopicScript = (
  redis: Redis,
  script: string,
  topic: NotificationTopic,
  arg: number
) =>
  redis.eval(
    script,
    3,
    getQueueKey(topic),
    getProcessingKey(topic),
    getClaimedKey(topic),
    arg
  )

const DEQUEUE_SCRIPT = `
local raw = redis.call('RPOPLPUSH', KEYS[1], KEYS[2])
if raw then
  redis.call('ZADD', KEYS[3], ARGV[1], raw)
end
return raw
`

const REQUEUE_STALE_SCRIPT = `
local moved = 0
local entries = redis.call('LRANGE', KEYS[2], 0, -1)
for _, raw in ipairs(entries) do
  local claimedAt = redis.call('ZSCORE', KEYS[3], raw)
  if (not claimedAt) or tonumber(claimedAt) <= tonumber(ARGV[1]) then
    redis.call('LREM', KEYS[2], 1, raw)
    redis.call('ZREM', KEYS[3], raw)
    redis.call('RPUSH', KEYS[1], raw)
    moved = moved + 1
  end
end
return moved
`

export const makeRedisMessageQueue = (redis: Redis): IMessageQueue => ({
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

  // No span here: dequeue runs on every poll tick, so the queue is empty
  // the vast majority of the time. Spanning the poll emitted millions of
  // no-op spans/week. The hit path is instrumented in the worker's
  // `notification-worker.consume` span instead (only opened when a message
  // is actually dequeued).
  dequeue: (topic) =>
    Effect.tryPromise({
      try: async () => {
        const rawData = (await evalTopicScript(
          redis,
          DEQUEUE_SCRIPT,
          topic,
          Date.now()
        )) as string | null
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
    }),

  ack: (topic, rawData) =>
    Effect.tryPromise({
      try: () =>
        redis
          .multi()
          .lrem(getProcessingKey(topic), 1, rawData)
          .zrem(getClaimedKey(topic), rawData)
          .exec(),
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
      try: () =>
        redis
          .multi()
          .lrem(getProcessingKey(topic), 1, rawData)
          .zrem(getClaimedKey(topic), rawData)
          .rpush(getQueueKey(topic), rawData)
          .exec(),
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

  requeueStale: (topic, olderThan) =>
    Effect.tryPromise({
      try: async () =>
        Number(
          await evalTopicScript(
            redis,
            REQUEUE_STALE_SCRIPT,
            topic,
            Date.now() - Duration.toMillis(olderThan)
          )
        ),
      catch: (error) =>
        new QueueOperationError({
          message: `Failed to requeue stale messages for ${topic}`,
          cause: error,
        }),
    }).pipe(
      Effect.withSpan('Redis.requeueStale', {
        attributes: { 'queue.topic': topic },
      })
    ),
})

// Redis implementation of IMessageQueue
export const RedisMessageQueueLive = Layer.effect(
  MessageQueue,
  Effect.map(RedisClient, makeRedisMessageQueue)
)

// Redis client layer
export const RedisClientLive = Layer.effect(
  RedisClient,
  Effect.gen(function* () {
    const redisUrl = yield* Config.String('REDIS_URL').pipe(
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
