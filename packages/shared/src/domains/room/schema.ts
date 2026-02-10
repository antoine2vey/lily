import { Schema } from 'effect'

export const Room = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.String,
  order: Schema.Number,
  userId: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export const RoomRef = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.String,
})

export const RoomCreateRequest = Schema.Struct({
  name: Schema.String,
  icon: Schema.optionalWith(Schema.String, { default: () => '🏠' }),
})

export const RoomUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  icon: Schema.optional(Schema.String),
  order: Schema.optional(Schema.Number),
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
