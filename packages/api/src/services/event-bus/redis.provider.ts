import { RedisClient } from '@lily/api/services/message-queue/redis.provider'
import {
  type AppEvent,
  AppEvent as AppEventSchema,
  EventBus,
  EventBusConnectionError,
  EventBusPublishError,
  type IEventBus,
} from '@lily/shared/server'
import { Effect, Layer, Queue, Runtime, Schema } from 'effect'

// Channel name for event bus pub-sub
const CHANNEL = 'lily:events'

// Redis pub-sub implementation of IEventBus
export const RedisEventBusLive = Layer.scoped(
  EventBus,
  Effect.gen(function* () {
    const publisherRedis = yield* RedisClient
    // Duplicate connection for subscriber (Redis requires separate connections for pub/sub)
    const subscriberRedis = publisherRedis.duplicate()

    // Create internal queue for local subscribers
    const queue = yield* Queue.unbounded<AppEvent>()

    // Subscribe to Redis channel
    yield* Effect.tryPromise({
      try: () => subscriberRedis.subscribe(CHANNEL),
      catch: (error) =>
        new EventBusConnectionError({
          message: 'Failed to subscribe to event bus channel',
          cause: error,
        }),
    })

    yield* Effect.log('Subscribed to Redis event bus channel', {
      channel: CHANNEL,
    })

    // Extract runtime so we can fork effects from the Redis callback
    const runtime = yield* Effect.runtime<never>()

    // Listen for messages and enqueue to local queue
    subscriberRedis.on('message', (channel, message) => {
      if (channel === CHANNEL) {
        Runtime.runFork(runtime)(
          Effect.gen(function* () {
            const parsed = yield* Effect.try(
              () => JSON.parse(message) as unknown
            )
            const decoded = yield* Schema.decodeUnknown(AppEventSchema)(parsed)
            yield* Queue.offer(queue, decoded)
          }).pipe(
            Effect.catchTags({
              UnknownException: (error) =>
                Effect.logError('Failed to decode event bus message', {
                  error,
                }),
              ParseError: (error) =>
                Effect.logError('Failed to decode event bus message', {
                  error,
                }),
            })
          )
        )
      }
    })

    // Cleanup subscriber on scope close
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        subscriberRedis.unsubscribe(CHANNEL)
        subscriberRedis.disconnect()
      })
    )

    const eventBus: IEventBus = {
      publish: (event) =>
        Effect.tryPromise({
          try: () => publisherRedis.publish(CHANNEL, JSON.stringify(event)),
          catch: (error) =>
            new EventBusPublishError({
              message: 'Failed to publish event to Redis',
              cause: error,
            }),
        }).pipe(Effect.asVoid),

      subscribe: Effect.succeed(queue),
    }

    return eventBus
  })
)
