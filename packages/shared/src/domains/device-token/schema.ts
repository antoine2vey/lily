import { Schema } from 'effect'

// Re-export errors for convenient imports
export { DeviceTokenNotFoundError } from './errors'

// What `Notifications.getExpoPushTokenAsync` returns. Stricter than the
// server SDK's `Expo.isExpoPushToken`, so every token accepted here is one the
// push provider will send to.
export const ExpoPushToken = Schema.String.check(
  Schema.isPattern(/^Expo(nent)?PushToken\[[^\]]+\]$/, {
    message: 'Expected an Expo push token (ExponentPushToken[...])',
  })
)

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
  token: ExpoPushToken,
  platform: Schema.Literals(['ios', 'android', 'web']),
})

// Type exports
export type DeviceToken = typeof DeviceToken.Type
export type DeviceTokenCreateRequest = typeof DeviceTokenCreateRequest.Type
