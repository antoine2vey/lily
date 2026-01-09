import { Data, Schema } from 'effect'

// Event schemas
export const PlantCreatedEvent = Schema.Struct({
  _tag: Schema.Literal('PlantCreated'),
  userId: Schema.String,
  plantId: Schema.String,
})

export const CareLogCreatedEvent = Schema.Struct({
  _tag: Schema.Literal('CareLogCreated'),
  userId: Schema.String,
  plantId: Schema.String,
  careLogId: Schema.String,
  type: Schema.Union(
    Schema.Literal('watering'),
    Schema.Literal('fertilization')
  ),
})

export const ChatMessageSentEvent = Schema.Struct({
  _tag: Schema.Literal('ChatMessageSent'),
  userId: Schema.String,
  plantId: Schema.String,
  messageId: Schema.String,
})

export const PhotoUploadedEvent = Schema.Struct({
  _tag: Schema.Literal('PhotoUploaded'),
  userId: Schema.String,
  plantId: Schema.String,
  photoId: Schema.String,
})

export const PlantScannedEvent = Schema.Struct({
  _tag: Schema.Literal('PlantScanned'),
  userId: Schema.String,
  scanId: Schema.String,
})

export const AttentionRespondedEvent = Schema.Struct({
  _tag: Schema.Literal('AttentionResponded'),
  userId: Schema.String,
  plantId: Schema.String,
})

export const CareHistoryViewedEvent = Schema.Struct({
  _tag: Schema.Literal('CareHistoryViewed'),
  userId: Schema.String,
})

export const DiseaseIdentifiedEvent = Schema.Struct({
  _tag: Schema.Literal('DiseaseIdentified'),
  userId: Schema.String,
  plantId: Schema.String,
})

export const RarePlantIdentifiedEvent = Schema.Struct({
  _tag: Schema.Literal('RarePlantIdentified'),
  userId: Schema.String,
  plantId: Schema.String,
})

export const ReminderRespondedEvent = Schema.Struct({
  _tag: Schema.Literal('ReminderResponded'),
  userId: Schema.String,
  plantId: Schema.String,
})

export const PlantSharedEvent = Schema.Struct({
  _tag: Schema.Literal('PlantShared'),
  userId: Schema.String,
  plantId: Schema.String,
})

// Union of all events
export const AppEvent = Schema.Union(
  PlantCreatedEvent,
  CareLogCreatedEvent,
  ChatMessageSentEvent,
  PhotoUploadedEvent,
  PlantScannedEvent,
  AttentionRespondedEvent,
  CareHistoryViewedEvent,
  DiseaseIdentifiedEvent,
  RarePlantIdentifiedEvent,
  ReminderRespondedEvent,
  PlantSharedEvent
)

export type AppEvent = typeof AppEvent.Type
export type PlantCreatedEvent = typeof PlantCreatedEvent.Type
export type CareLogCreatedEvent = typeof CareLogCreatedEvent.Type
export type ChatMessageSentEvent = typeof ChatMessageSentEvent.Type
export type PhotoUploadedEvent = typeof PhotoUploadedEvent.Type
export type PlantScannedEvent = typeof PlantScannedEvent.Type
export type AttentionRespondedEvent = typeof AttentionRespondedEvent.Type
export type CareHistoryViewedEvent = typeof CareHistoryViewedEvent.Type
export type DiseaseIdentifiedEvent = typeof DiseaseIdentifiedEvent.Type
export type RarePlantIdentifiedEvent = typeof RarePlantIdentifiedEvent.Type
export type ReminderRespondedEvent = typeof ReminderRespondedEvent.Type
export type PlantSharedEvent = typeof PlantSharedEvent.Type

// Error types
export class EventBusConnectionError extends Data.TaggedError(
  'EventBusConnectionError'
)<{
  message: string
  cause?: unknown
}> {}

export class EventBusPublishError extends Data.TaggedError(
  'EventBusPublishError'
)<{
  message: string
  cause?: unknown
}> {}
