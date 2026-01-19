import { type AppEvent, EventBus, type IEventBus } from '@lily/shared/server'
import { Effect, Layer, PubSub } from 'effect'

// In-memory implementation of IEventBus for testing and local development
export const InMemoryEventBusLive = Layer.effect(
  EventBus,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<AppEvent>()

    const eventBus: IEventBus = {
      publish: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
      subscribe: PubSub.subscribe(pubsub),
    }

    return eventBus
  })
)
