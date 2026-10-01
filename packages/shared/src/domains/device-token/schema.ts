import { Schema } from 'effect'

// Re-export errors for convenient imports
export { DeviceTokenNotFoundError } from './errors'

// Device token schemas
export const DeviceToken = Schema.Struct({
  id: Schema.String,
  token: Schema.String,
  platform: Schema.Literals(['ios', 'android', 'web']),
  isActive: Schema.Boolean,
  userId: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})

export const DeviceTokenCreateRequest = Schema.Struct({
  token: Schema.String,
  platform: Schema.Literals(['ios', 'android', 'web']),
})

// Type exports
export type DeviceToken = typeof DeviceToken.Type
export type DeviceTokenCreateRequest = typeof DeviceTokenCreateRequest.Type
