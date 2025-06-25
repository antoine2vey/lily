import { Rpc, RpcGroup } from '@effect/rpc'
import { DatabaseError } from '@lily/api/services/database/error'
import { PlantNotFoundError } from '@lily/api/services/plants/error'
import { Schema } from 'effect'

// Plant health enum matching Prisma schema
export const PlantHealth = Schema.Enums({
  THRIVING: 'THRIVING',
  HEALTHY: 'HEALTHY',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  SICK: 'SICK',
  RECOVERING: 'RECOVERING',
})

// Define a plant with all fields from Prisma schema
export class Plant extends Schema.Class<Plant>('Plant')({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  wateringFrequencyDays: Schema.Number,
}) {}

// Request schemas for plant operations
export class PlantByIdRequest extends Schema.Class<PlantByIdRequest>(
  'PlantByIdRequest'
)({
  id: Schema.String,
}) {}

export class PlantCreateRequest extends Schema.Class<PlantCreateRequest>(
  'PlantCreateRequest'
)({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  humidityRating: Schema.Number,
  lightingRating: Schema.Number,
  petToxicityRating: Schema.Number,
  wateringRating: Schema.Number,
  wateringFrequencyDays: Schema.Number,
  userId: Schema.String,
}) {}

export class PlantUpdateRequest extends Schema.Class<PlantUpdateRequest>(
  'PlantUpdateRequest'
)({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  humidityRating: Schema.optional(Schema.Number),
  lightingRating: Schema.optional(Schema.Number),
  petToxicityRating: Schema.optional(Schema.Number),
  wateringRating: Schema.optional(Schema.Number),
  health: Schema.optional(PlantHealth),
  wateringFrequencyDays: Schema.optional(Schema.Number),
  lastWateredAt: Schema.optional(Schema.Date),
  nextWateringAt: Schema.optional(Schema.Date),
}) {}

export class PlantDeleteRequest extends Schema.Class<PlantDeleteRequest>(
  'PlantDeleteRequest'
)({
  id: Schema.String,
}) {}

export class PlantByUserIdRequest extends Schema.Class<PlantByUserIdRequest>(
  'PlantByUserIdRequest'
)({
  userId: Schema.String,
}) {}

export class PlantWaterRequest extends Schema.Class<PlantWaterRequest>(
  'PlantWaterRequest'
)({
  id: Schema.String,
  notes: Schema.optional(Schema.String),
}) {}

// Define a group of RPCs for plant management
export class PlantRpcs extends RpcGroup.make(
  // Get all plants
  Rpc.make('PlantList', {
    success: Plant,
    stream: true,
    error: DatabaseError,
  }),

  // Get plant by ID
  Rpc.make('PlantById', {
    success: Plant,
    stream: true,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantByIdRequest,
  }),

  // Get plants by user ID
  Rpc.make('PlantByUserId', {
    success: Plant,
    stream: true,
    error: DatabaseError,
    payload: PlantByUserIdRequest,
  }),

  // Create a new plant
  Rpc.make('PlantCreate', {
    success: Plant,
    error: DatabaseError,
    payload: PlantCreateRequest,
  }),

  // Update a plant
  Rpc.make('PlantUpdate', {
    success: Plant,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantUpdateRequest,
  }),

  // Delete a plant
  Rpc.make('PlantDelete', {
    success: Plant,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantDeleteRequest,
  }),

  // Water a plant
  Rpc.make('PlantWater', {
    success: Plant,
    error: Schema.Union(DatabaseError, PlantNotFoundError),
    payload: PlantWaterRequest,
  })
) {}
