import { EventBus, type IEventBus } from '@lily/api/services/event-bus/service'
import type { AppEvent } from '@lily/api/services/event-bus/types'
import { Effect, Layer, Queue } from 'effect'

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
