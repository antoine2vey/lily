import { Schema } from 'effect'
import { CareType } from '../care/types'
import { PaginatedResponse } from '../common/pagination'
import { RoomRef } from '../room/schema'

export const PlantHealthStatus = Schema.Literal(
  'THRIVING',
  'HEALTHY',
  'NEEDS_ATTENTION',
  'SICK',
  'RECOVERING'
)
export type PlantHealthStatus = typeof PlantHealthStatus.Type

export const PlantOwnership = Schema.Literal('owned', 'caretaking')
export type PlantOwnership = typeof PlantOwnership.Type

export const PlantFilter = Schema.Literal('needsAttention', 'overdue', 'all')
export type PlantFilter = typeof PlantFilter.Type

export const PlantSort = Schema.Literal('added', 'name')
export type PlantSort = typeof PlantSort.Type

export const PlantCareSchedule = Schema.Struct({
  careType: CareType,
  frequencyDays: Schema.Number,
  lastCareAt: Schema.NullOr(Schema.Date),
  nextCareAt: Schema.NullOr(Schema.Date),
})

export type PlantCareSchedule = typeof PlantCareSchedule.Type

export const Plant = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  imageUrl: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
  dateAdded: Schema.Date,
  updatedAt: Schema.Date,
  humidityRating: Schema.Number,
  lightingRating: Schema.Number,
  petToxicityRating: Schema.Number,
  wateringRating: Schema.Number,
  health: PlantHealthStatus,
  remindersEnabled: Schema.Boolean,
  isFavorite: Schema.Boolean,
  userId: Schema.String,
  roomId: Schema.NullOr(Schema.String),
  room: Schema.NullOr(RoomRef),
  ownership: Schema.optionalWith(PlantOwnership, {
    default: () => 'owned' as const,
  }),
  ownerName: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  schedules: Schema.Array(PlantCareSchedule),
})

export const PlantCreateRequest = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  humidityRating: Schema.Number,
  lightingRating: Schema.Number,
  petToxicityRating: Schema.Number,
  wateringRating: Schema.Number,
  wateringFrequencyDays: Schema.Number,
  userId: Schema.String,
})

export const PlantUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  wateringFrequencyDays: Schema.optional(Schema.Number),
  fertilizationFrequencyDays: Schema.optional(Schema.NullOr(Schema.Number)),
  mistingFrequencyDays: Schema.optional(Schema.NullOr(Schema.Number)),
  repottingFrequencyDays: Schema.optional(Schema.NullOr(Schema.Number)),
  humidityRating: Schema.optional(Schema.Number),
  lightingRating: Schema.optional(Schema.Number),
  petToxicityRating: Schema.optional(Schema.Number),
  wateringRating: Schema.optional(Schema.Number),
  isFavorite: Schema.optional(Schema.Boolean),
  roomId: Schema.optional(Schema.NullOr(Schema.String)),
})

// Enhanced plant creation request
export const EnhancedPlantCreateRequest = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  plantingDate: Schema.optional(Schema.Date),
  wateringFrequencyDays: Schema.Number,
  fertilizationFrequencyDays: Schema.optional(Schema.Number),
  mistingFrequencyDays: Schema.optional(Schema.Number),
  repottingFrequencyDays: Schema.optional(Schema.Number),
  luxNeeded: Schema.Number,
  humidityRating: Schema.optional(Schema.Number),
  petToxicityRating: Schema.Number,
  remindersEnabled: Schema.optional(Schema.Boolean),
  roomId: Schema.optional(Schema.String),
})

// AI identify response (shared by both AI identify and nursery card scan)
export const AIIdentifyResponse = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  family: Schema.NullOr(Schema.String),
  confidence: Schema.Number,
  alternatives: Schema.Array(
    Schema.Struct({
      name: Schema.NullOr(Schema.String),
      confidence: Schema.Number,
    })
  ),
  wateringFrequencyDays: Schema.NullOr(Schema.Number),
  luxNeeded: Schema.NullOr(Schema.Number),
  humidityRating: Schema.NullOr(Schema.Number),
  petToxicityRating: Schema.NullOr(Schema.Number),
  fertilizationFrequencyDays: Schema.NullOr(Schema.Number),
  mistingFrequencyDays: Schema.NullOr(Schema.Number),
  repottingFrequencyDays: Schema.NullOr(Schema.Number),
  category: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  wateringTips: Schema.NullOr(Schema.String),
  imageUrl: Schema.String,
})

// Plant photo schema
export const PlantPhoto = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  takenAt: Schema.Date,
  plantId: Schema.String,
})

// Plants list response - uses standard pagination format
export const PlantsListResponse = PaginatedResponse(Plant)

// Plant photos list response - uses standard pagination format
export const PlantPhotosListResponse = PaginatedResponse(PlantPhoto)

// Plant detail with photos (for single plant endpoint)
export const PlantDetail = Schema.Struct({
  ...Plant.fields,
  photos: Schema.Array(PlantPhoto),
})

// Generic care request (for POST /plants/:id/care)
export const PlantCareRequest = Schema.Struct({
  careType: CareType,
  notes: Schema.optional(Schema.String),
  date: Schema.optional(Schema.Date),
})

export type PlantCareRequest = typeof PlantCareRequest.Type

// Generic batch care request (for POST /plants/care-multiple)
export const CareMultiplePlantsRequest = Schema.Struct({
  plantIds: Schema.Array(Schema.String),
  careType: CareType,
})

export type CareMultiplePlantsRequest = typeof CareMultiplePlantsRequest.Type

export const CareMultiplePlantsResult = Schema.Struct({
  plantId: Schema.String,
  success: Schema.Boolean,
  plant: Schema.optional(Plant),
})

export const CareMultiplePlantsResponse = Schema.Array(CareMultiplePlantsResult)

export type CareMultiplePlantsResult = typeof CareMultiplePlantsResult.Type
export type CareMultiplePlantsResponse = typeof CareMultiplePlantsResponse.Type

export const PlantCorrectCareDatesRequest = Schema.Struct({
  lastWateredAt: Schema.optional(Schema.Date),
  lastFertilizedAt: Schema.optional(Schema.Date),
})

// Type exports
export type PlantCorrectCareDatesRequest =
  typeof PlantCorrectCareDatesRequest.Type
export type Plant = typeof Plant.Type
export type PlantCreateRequest = typeof PlantCreateRequest.Type
export type PlantUpdateRequest = typeof PlantUpdateRequest.Type
export type EnhancedPlantCreateRequest = typeof EnhancedPlantCreateRequest.Type
export type AIIdentifyResponse = typeof AIIdentifyResponse.Type
export type PlantPhoto = typeof PlantPhoto.Type
export type PlantsListResponse = typeof PlantsListResponse.Type
export type PlantPhotosListResponse = typeof PlantPhotosListResponse.Type
export type PlantDetail = typeof PlantDetail.Type
