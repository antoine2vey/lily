import type {
  AppEvent,
  EventBusConnectionError,
  EventBusPublishError,
} from '@lily/shared/services/event-bus/types'
import { Context, type Effect, type Queue, type Scope } from 'effect'

// Provider-agnostic event bus interface
export interface IEventBus {
  readonly publish: (
    event: AppEvent
  ) => Effect.Effect<void, EventBusPublishError>

  readonly subscribe: Effect.Effect<
    Queue.Dequeue<AppEvent>,
    EventBusConnectionError,
    Scope.Scope
  >
}

// Context tag for dependency injection
export class EventBus extends Context.Tag('EventBus')<EventBus, IEventBus>() {}
