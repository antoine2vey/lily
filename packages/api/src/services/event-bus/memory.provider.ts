import { type AppEvent, EventBus, type IEventBus } from '@lily/shared/server'
import { Effect, Layer, Queue } from 'effect'

// In-memory implementation of IEventBus for testing and local development.
// Same fan-out shape as the Redis provider: every subscriber owns a queue and
// every published event is offered to each of them.
export const InMemoryEventBusLive = Layer.effect(
  EventBus,
  Effect.sync(() => {
    const subscribers = new Set<Queue.Queue<AppEvent>>()

    const eventBus: IEventBus = {
      publish: (event) =>
        Effect.forEach(subscribers, (q) => Queue.offer(q, event), {
          discard: true,
        }),
      subscribe: Effect.gen(function* () {
        const q = yield* Queue.unbounded<AppEvent>()
        subscribers.add(q)
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => subscribers.delete(q))
        )
        return q
      }),
    }

    return eventBus
  })
)
