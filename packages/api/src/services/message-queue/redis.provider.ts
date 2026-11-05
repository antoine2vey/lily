import { NOTIFICATION_METADATA } from '@lily/shared/notification'
import {
  type IMessageQueue,
  MessageQueue,
  NOTIFICATION_TOPICS,
  QueueConnectionError,
  QueueMessage,
  QueueMessageDecodeError,
  QueueOperationError,
} from '@lily/shared/server'
import {
  Array,
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Schema,
} from 'effect'
import Redis from 'ioredis'

// Redis client service tag
export class RedisClient extends Context.Service<RedisClient, Redis>()(
  'RedisClient'
) {}

const QUEUE_KEY = 'lily:queue:notifications'
const IN_FLIGHT_KEY = `${QUEUE_KEY}:in-flight`
const CLAIMED_AT_KEY = `${QUEUE_KEY}:in-flight:claimed-at`

const evalQueueScript = (
  redis: Redis,
  script: string,
  ...args: ReadonlyArray<number | string>
) => redis.eval(script, 3, QUEUE_KEY, IN_FLIGHT_KEY, CLAIMED_AT_KEY, ...args)

const LEGACY_PREFIX = 'lily:notifications:'
const LEGACY_LIST_KEYS = Array.flatMap(NOTIFICATION_TOPICS, (topic) => [
  `${LEGACY_PREFIX}${topic}`,
  `${LEGACY_PREFIX}${topic}:processing`,
])
const LEGACY_CLAIMED_KEYS = Array.map(
  NOTIFICATION_TOPICS,
  (topic) => `${LEGACY_PREFIX}${topic}:processing:claimed`
)

export const DEQUEUE_SCRIPT = `
local raw = redis.call('RPOP', KEYS[1])
if raw then
  redis.call('HSET', KEYS[2], ARGV[2], raw)
  redis.call('ZADD', KEYS[3], ARGV[1], ARGV[2])
end
return raw
`

export const REQUEUE_STALE_SCRIPT = `
local claims = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', ARGV[1])
local moved = 0
for _, claim in ipairs(claims) do
  local raw = redis.call('HGET', KEYS[2], claim)
  if raw then
    redis.call('RPUSH', KEYS[1], raw)
    moved = moved + 1
  end
  redis.call('HDEL', KEYS[2], claim)
  redis.call('ZREM', KEYS[3], claim)
end
return moved
`

const decodeDequeued = Schema.decodeUnknownEffect(Schema.NullOr(Schema.String))

const decodeQueueMessage = Schema.decodeUnknownEffect(
  Schema.fromJsonString(QueueMessage)
)

const decodeTopicMetadata = (message: QueueMessage) =>
  Option.match(Option.fromNullishOr(message.payload.metadata), {
    onNone: () => Effect.succeed(message),
    onSome: (metadata) =>
      Schema.decodeUnknownEffect(NOTIFICATION_METADATA[message.topic])(
        metadata
      ).pipe(
        Effect.map(
          (decoded): QueueMessage => ({
            ...message,
            payload: { ...message.payload, metadata: decoded },
          })
        )
      ),
  })

export const decodeQueueEntry = (rawData: string, claim: string) =>
  decodeQueueMessage(rawData).pipe(
    Effect.flatMap(decodeTopicMetadata),
    Effect.map((message) => ({ message, rawData, claim })),
    Effect.catchTag('SchemaError', (error) =>
      Effect.fail(
        new QueueMessageDecodeError({ rawData, claim, message: error.message })
      )
    )
  )

const queueOperation = <A>(message: string, operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new QueueOperationError({ message, cause }),
  })

const popEach = (
  redis: Redis,
  key: string
): Effect.Effect<ReadonlyArray<string>, QueueOperationError> =>
  queueOperation(`Failed to drain ${key}`, () => redis.lpop(key)).pipe(
    Effect.flatMap((raw) =>
      Option.match(Option.fromNullishOr(raw), {
        onNone: () => Effect.succeed([]),
        onSome: (entry) =>
          Effect.map(popEach(redis, key), (rest) => [entry, ...rest]),
      })
    )
  )

export const makeRedisMessageQueue = (redis: Redis): IMessageQueue => ({
  enqueue: (message) =>
    queueOperation(`Failed to enqueue ${message.topic} message`, () =>
      redis.lpush(QUEUE_KEY, JSON.stringify(message))
    ).pipe(
      Effect.asVoid,
      Effect.withSpan('Redis.enqueue', {
        attributes: { 'queue.topic': message.topic },
      })
    ),

  // No span here: dequeue runs on every poll tick, so the queue is empty
  // the vast majority of the time. Spanning the poll emitted millions of
  // no-op spans/week. The hit path is instrumented in the worker's
  // `notification-worker.consume` span instead (only opened when a message
  // is actually dequeued).
  dequeue: Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const claim = crypto.randomUUID()
    const result = yield* queueOperation('Failed to dequeue message', () =>
      evalQueueScript(redis, DEQUEUE_SCRIPT, now, claim)
    )
    const raw = yield* decodeDequeued(result).pipe(
      Effect.mapError(
        (error) =>
          new QueueOperationError({
            message: 'Unexpected dequeue result',
            cause: error,
          })
      )
    )
    return yield* Option.match(Option.fromNullishOr(raw), {
      onNone: () => Effect.succeed(null),
      onSome: (entry) => decodeQueueEntry(entry, claim),
    })
  }),

  ack: (claim) =>
    queueOperation('Failed to ack message', () =>
      redis
        .multi()
        .hdel(IN_FLIGHT_KEY, claim)
        .zrem(CLAIMED_AT_KEY, claim)
        .exec()
    ).pipe(Effect.asVoid, Effect.withSpan('Redis.ack')),

  refreshClaim: (claim) =>
    Effect.flatMap(Clock.currentTimeMillis, (now) =>
      queueOperation('Failed to refresh claim', () =>
        redis.zadd(CLAIMED_AT_KEY, 'XX', now, claim)
      )
    ).pipe(Effect.asVoid, Effect.withSpan('Redis.refreshClaim')),

  requeueStale: (olderThan) =>
    Effect.flatMap(Clock.currentTimeMillis, (now) =>
      queueOperation('Failed to requeue stale messages', async () =>
        Number(
          await evalQueueScript(
            redis,
            REQUEUE_STALE_SCRIPT,
            now - Duration.toMillis(olderThan)
          )
        )
      )
    ).pipe(Effect.withSpan('Redis.requeueStale')),

  drainLegacyTopicLists: queueOperation('Failed to check legacy lists', () =>
    redis.exists(...LEGACY_LIST_KEYS, ...LEGACY_CLAIMED_KEYS)
  ).pipe(
    Effect.flatMap((existing) =>
      existing === 0
        ? Effect.succeed([])
        : Effect.forEach(LEGACY_LIST_KEYS, (key) => popEach(redis, key)).pipe(
            Effect.map(Array.flatten),
            Effect.tap(() =>
              queueOperation('Failed to delete legacy claimed sets', () =>
                redis.del(...LEGACY_CLAIMED_KEYS)
              )
            )
          )
    ),
    Effect.withSpan('Redis.drainLegacyTopicLists')
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
