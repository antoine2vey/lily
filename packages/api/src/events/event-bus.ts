import type { AppEvent } from '@lily/api/events/types'
import { Context, Effect, Layer, PubSub, type Queue, type Scope } from 'effect'

// EventBus interface
export interface IEventBus {
  readonly publish: (event: AppEvent) => Effect.Effect<void>
  readonly subscribe: Effect.Effect<Queue.Dequeue<AppEvent>, never, Scope.Scope>
}

// Context Tag
export class EventBus extends Context.Tag('EventBus')<EventBus, IEventBus>() {}

// Live implementation
export const EventBusLive = Layer.effect(
  EventBus,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<AppEvent>()

    return {
      publish: (event: AppEvent) =>
        PubSub.publish(pubsub, event).pipe(Effect.asVoid),
      subscribe: PubSub.subscribe(pubsub),
    }
  })
)
