import { Schema } from 'effect'

// Care log schemas
export const CareLog = Schema.Struct({
  id: Schema.String,
  type: Schema.Union(
    Schema.Literal('watering'),
    Schema.Literal('fertilization')
  ),
  notes: Schema.optional(Schema.String),
  date: Schema.Date,
  photoUrl: Schema.optional(Schema.String),
  plantId: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export const CareLogCreateRequest = Schema.Struct({
  type: Schema.Union(
    Schema.Literal('watering'),
    Schema.Literal('fertilization')
  ),
  notes: Schema.optional(Schema.String),
  date: Schema.optional(Schema.Date),
  photoUrl: Schema.optional(Schema.String),
})

export const CareLogUpdateRequest = Schema.Struct({
  notes: Schema.optional(Schema.String),
  date: Schema.optional(Schema.Date),
  photoUrl: Schema.optional(Schema.String),
})

// Type exports
export type CareLog = typeof CareLog.Type
export type CareLogCreateRequest = typeof CareLogCreateRequest.Type
export type CareLogUpdateRequest = typeof CareLogUpdateRequest.Type
