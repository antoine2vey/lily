import { Schema } from 'effect'

export const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
})

export const UserCreateRequest = Schema.Struct({
  email: Schema.String,
  name: Schema.String,
})

export const UserUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
})

// User settings schemas - simplified to use existing user fields plus default notification settings
export const UserSettings = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  image: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.String), // Will default to empty string for now
  notifications: Schema.Struct({
    soilAlerts: Schema.Boolean,
    wateringReminders: Schema.Boolean,
    ads: Schema.Boolean,
  }),
})

export const UserSettingsUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.String),
  notifications: Schema.optional(
    Schema.Struct({
      soilAlerts: Schema.optional(Schema.Boolean),
      wateringReminders: Schema.optional(Schema.Boolean),
      ads: Schema.optional(Schema.Boolean),
    })
  ),
})

// Type exports
export type User = typeof User.Type
export type UserCreateRequest = typeof UserCreateRequest.Type
export type UserUpdateRequest = typeof UserUpdateRequest.Type
export type UserSettings = typeof UserSettings.Type
export type UserSettingsUpdateRequest = typeof UserSettingsUpdateRequest.Type

export class UserByIdRequest extends Schema.Class<UserByIdRequest>(
  'UserByIdRequest'
)({
  id: Schema.String,
}) {}

export class UserDeleteRequest extends Schema.Class<UserDeleteRequest>(
  'UserDeleteRequest'
)({
  id: Schema.String,
}) {}
