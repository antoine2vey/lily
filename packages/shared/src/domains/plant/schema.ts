import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

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
  health: Schema.Union(
    Schema.Literal('THRIVING'),
    Schema.Literal('HEALTHY'),
    Schema.Literal('NEEDS_ATTENTION'),
    Schema.Literal('SICK'),
    Schema.Literal('RECOVERING')
  ),
  wateringFrequencyDays: Schema.Number,
  lastWateredAt: Schema.NullOr(Schema.Date),
  nextWateringAt: Schema.NullOr(Schema.Date),
  fertilizationFrequencyDays: Schema.NullOr(Schema.Number),
  lastFertilizedAt: Schema.NullOr(Schema.Date),
  nextFertilizationAt: Schema.NullOr(Schema.Date),
  remindersEnabled: Schema.Boolean,
  isFavorite: Schema.Boolean,
  userId: Schema.String,
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
  humidityRating: Schema.optional(Schema.Number),
  lightingRating: Schema.optional(Schema.Number),
  petToxicityRating: Schema.optional(Schema.Number),
  wateringRating: Schema.optional(Schema.Number),
  isFavorite: Schema.optional(Schema.Boolean),
})

export const PlantWaterRequest = Schema.Struct({
  notes: Schema.optional(Schema.String),
})

// Enhanced plant creation request
export const EnhancedPlantCreateRequest = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  plantingDate: Schema.optional(Schema.Date),
  wateringFrequencyDays: Schema.Number,
  sunlightPreference: Schema.String,
  humidityRating: Schema.optional(Schema.Number),
  petToxicityRating: Schema.Number,
  remindersEnabled: Schema.optional(Schema.Boolean),
})

// Scan card response
export const ScanCardResponse = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  humidityRating: Schema.NullOr(Schema.Number),
  lightingRating: Schema.NullOr(Schema.Number),
  petToxicityRating: Schema.NullOr(Schema.Number),
  wateringRating: Schema.NullOr(Schema.Number),
  wateringFrequencyDays: Schema.NullOr(Schema.Number),
  fertilizationFrequencyDays: Schema.NullOr(Schema.Number),
  category: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
})

// AI identify response
export const AIIdentifyResponse = Schema.Struct({
  species: Schema.optional(Schema.String),
  commonName: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  wateringFrequencyDays: Schema.optional(Schema.Number),
  sunlightPreference: Schema.optional(Schema.String),
  humidityRating: Schema.optional(Schema.Number),
  lightingRating: Schema.optional(Schema.Number),
  petToxicityRating: Schema.optional(Schema.Number),
  confidence: Schema.Number,
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

// Type exports
export type Plant = typeof Plant.Type
export type PlantCreateRequest = typeof PlantCreateRequest.Type
export type PlantUpdateRequest = typeof PlantUpdateRequest.Type
export type PlantWaterRequest = typeof PlantWaterRequest.Type
export type EnhancedPlantCreateRequest = typeof EnhancedPlantCreateRequest.Type
export type ScanCardResponse = typeof ScanCardResponse.Type
export type AIIdentifyResponse = typeof AIIdentifyResponse.Type
export type PlantPhoto = typeof PlantPhoto.Type
export type PlantsListResponse = typeof PlantsListResponse.Type
export type PlantPhotosListResponse = typeof PlantPhotosListResponse.Type
export type PlantDetail = typeof PlantDetail.Type
