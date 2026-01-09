import { type AppEvent, EventBus, type IEventBus } from '@lily/shared'
import { Effect, Layer, Queue } from 'effect'

export interface MockEventBusData {
  publishedEvents: AppEvent[]
}

export const createMockEventBus = (
  data: MockEventBusData = { publishedEvents: [] }
): Layer.Layer<EventBus> => {
  const eventBus: IEventBus = {
    publish: (event: AppEvent) => {
      data.publishedEvents.push(event)
      return Effect.void
    },
    subscribe: Effect.sync(() => {
      // Return an empty queue for testing
      return Queue.unbounded<AppEvent>().pipe(
        Effect.map((queue) => queue as Queue.Dequeue<AppEvent>),
        Effect.runSync
      )
    }),
  }

  return Layer.succeed(EventBus, eventBus)
}
