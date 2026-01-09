// Re-export from shared for backward compatibility

// Retry policy
export {
  eventRetryPolicy,
  publishWithRetry,
} from '@lily/api/events/retry-policy'

// Re-export providers from services
export {
  InMemoryEventBusLive,
  RedisEventBusLive,
} from '@lily/api/services/event-bus'
export {
  type AppEvent,
  type CareLogCreatedEvent,
  type ChatMessageSentEvent,
  EventBus,
  type IEventBus,
  type PhotoUploadedEvent,
  type PlantCreatedEvent,
  type PlantScannedEvent,
} from '@lily/shared'
