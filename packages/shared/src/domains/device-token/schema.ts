import { Schema } from 'effect'

// Device token schemas
export const DeviceToken = Schema.Struct({
  id: Schema.String,
  token: Schema.String,
  platform: Schema.Union(
    Schema.Literal('ios'),
    Schema.Literal('android'),
    Schema.Literal('web')
  ),
  isActive: Schema.Boolean,
  userId: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export const DeviceTokenCreateRequest = Schema.Struct({
  token: Schema.String,
  platform: Schema.Union(
    Schema.Literal('ios'),
    Schema.Literal('android'),
    Schema.Literal('web')
  ),
})

// Type exports
export type DeviceToken = typeof DeviceToken.Type
export type DeviceTokenCreateRequest = typeof DeviceTokenCreateRequest.Type
