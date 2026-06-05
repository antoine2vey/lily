import { Schema } from 'effect'
import { OrientationSchema } from '../common/orientation'

export const Room = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.String,
  luminosity: Schema.NullOr(Schema.Number),
  orientation: Schema.NullOr(OrientationSchema),
  isOutdoor: Schema.Boolean,
  order: Schema.Number,
  userId: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export const RoomRef = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.String,
  luminosity: Schema.NullOr(Schema.Number),
  orientation: Schema.NullOr(OrientationSchema),
  isOutdoor: Schema.Boolean,
})

export const RoomCreateRequest = Schema.Struct({
  name: Schema.String,
  icon: Schema.optionalWith(Schema.String, { default: () => '🏠' }),
  luminosity: Schema.optional(Schema.Number),
  orientation: Schema.optional(OrientationSchema),
  isOutdoor: Schema.optionalWith(Schema.Boolean, { default: () => false }),
})

export const RoomUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  icon: Schema.optional(Schema.String),
  order: Schema.optional(Schema.Number),
  luminosity: Schema.optional(Schema.NullOr(Schema.Number)),
  orientation: Schema.optional(Schema.NullOr(OrientationSchema)),
  isOutdoor: Schema.optional(Schema.Boolean),
})

export const RoomWithCount = Schema.Struct({
  ...Room.fields,
  plantCount: Schema.Number,
})

export const RoomListWithCountsResponse = Schema.Array(RoomWithCount)

// Type exports
export type Room = typeof Room.Type
export type RoomRef = typeof RoomRef.Type
export type RoomCreateRequest = typeof RoomCreateRequest.Type
export type RoomUpdateRequest = typeof RoomUpdateRequest.Type
export type RoomWithCount = typeof RoomWithCount.Type
export type RoomListWithCountsResponse = typeof RoomListWithCountsResponse.Type
