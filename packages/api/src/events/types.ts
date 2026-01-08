import { Schema } from 'effect'

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

// Union of all events
export const AppEvent = Schema.Union(
  PlantCreatedEvent,
  CareLogCreatedEvent,
  ChatMessageSentEvent,
  PhotoUploadedEvent,
  PlantScannedEvent
)

export type AppEvent = typeof AppEvent.Type
export type PlantCreatedEvent = typeof PlantCreatedEvent.Type
export type CareLogCreatedEvent = typeof CareLogCreatedEvent.Type
export type ChatMessageSentEvent = typeof ChatMessageSentEvent.Type
export type PhotoUploadedEvent = typeof PhotoUploadedEvent.Type
export type PlantScannedEvent = typeof PlantScannedEvent.Type
