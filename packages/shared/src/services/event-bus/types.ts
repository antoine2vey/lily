import { Data, Schema } from 'effect'
import { CareType } from '../../domains/care/types'

// Event schemas
export const PlantCreatedEvent = Schema.TaggedStruct('PlantCreated', {
  userId: Schema.String,
  plantId: Schema.String,
})

export const CareLogCreatedEvent = Schema.TaggedStruct('CareLogCreated', {
  userId: Schema.String,
  plantId: Schema.String,
  careLogId: Schema.String,
  type: CareType,
})

export const ChatMessageSentEvent = Schema.TaggedStruct('ChatMessageSent', {
  userId: Schema.String,
  plantId: Schema.String,
  messageId: Schema.String,
})

export const PhotoUploadedEvent = Schema.TaggedStruct('PhotoUploaded', {
  userId: Schema.String,
  plantId: Schema.String,
  photoId: Schema.String,
})

export const PlantScannedEvent = Schema.TaggedStruct('PlantScanned', {
  userId: Schema.String,
  scanId: Schema.String,
})

export const AttentionRespondedEvent = Schema.TaggedStruct(
  'AttentionResponded',
  {
    userId: Schema.String,
    plantId: Schema.String,
  }
)

export const CareHistoryViewedEvent = Schema.TaggedStruct('CareHistoryViewed', {
  userId: Schema.String,
})

export const DiseaseIdentifiedEvent = Schema.TaggedStruct('DiseaseIdentified', {
  userId: Schema.String,
  plantId: Schema.String,
})

export const RarePlantIdentifiedEvent = Schema.TaggedStruct(
  'RarePlantIdentified',
  {
    userId: Schema.String,
    plantId: Schema.String,
  }
)

export const ReminderRespondedEvent = Schema.TaggedStruct('ReminderResponded', {
  userId: Schema.String,
  plantId: Schema.String,
})

export const PlantSharedEvent = Schema.TaggedStruct('PlantShared', {
  userId: Schema.String,
  plantId: Schema.String,
})

export const UserFollowedEvent = Schema.TaggedStruct('UserFollowed', {
  followerId: Schema.String,
  followingId: Schema.String,
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
  PlantSharedEvent,
  UserFollowedEvent
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
export type UserFollowedEvent = typeof UserFollowedEvent.Type

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
