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

// Redis pub-sub implementation of IEventBus.
//
// Each `subscribe` call creates its OWN queue and registers it with the
// fan-out set. Every received Redis message gets offered to all registered
// queues, so every subscriber sees every event (proper pub-sub semantics).
//
// Prior implementation returned a single shared queue that all subscribers
// took from — meaning `Queue.take` races consumed each event exactly once
// across all callers. The first subscriber to wake up stole the event from
// the others. Symptoms: non-deterministic "my subscriber sometimes doesn't
// fire" bugs (e.g. LA refresh missing when achievement checker raced).
export const RedisEventBusLive = Layer.scoped(
  EventBus,
  Effect.gen(function* () {
    const publisherRedis = yield* RedisClient
    // Duplicate connection for subscriber (Redis requires separate connections for pub/sub)
    const subscriberRedis = publisherRedis.duplicate()

    // Fan-out registry: every subscribe() appends its queue here; every
    // inbound Redis message is offered to each.
    const subscribers = new Set<Queue.Queue<AppEvent>>()

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

    // Listen for messages and fan out to every local subscriber queue
    subscriberRedis.on('message', (channel, message) => {
      if (channel === CHANNEL) {
        Runtime.runFork(runtime)(
          Effect.gen(function* () {
            const parsed = yield* Effect.try(
              () => JSON.parse(message) as unknown
            )
            const decoded = yield* Schema.decodeUnknown(AppEventSchema)(parsed)
            // Offer to every registered queue. Unbounded queues never block.
            for (const q of subscribers) {
              yield* Queue.offer(q, decoded)
            }
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

      // Each caller gets a fresh queue appended to the fan-out set. Callers
      // that subscribe once per app lifetime leak one queue each; that's
      // negligible (count = number of subscribers, not events). If dynamic
      // subscribe/unsubscribe is ever needed, add a scoped release that
      // removes the queue from the set.
      subscribe: Effect.gen(function* () {
        const q = yield* Queue.unbounded<AppEvent>()
        subscribers.add(q)
        return q
      }),
    }

    return eventBus
  })
)
