import { Schema } from 'effect'

// Role, status, and language literals
export const UserRole = Schema.Literal('user', 'admin')
export const UserStatus = Schema.Literal('active', 'suspended', 'banned')
export const LanguageCode = Schema.Literal('en', 'fr')

export type UserRole = typeof UserRole.Type
export type UserStatus = typeof UserStatus.Type
export type LanguageCode = typeof LanguageCode.Type

export const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  bio: Schema.NullOr(Schema.String),
  careReminders: Schema.Boolean,
  weeklyDigest: Schema.Boolean,
  achievementNotifications: Schema.Boolean,
  tips: Schema.Boolean,
  productUpdates: Schema.Boolean,
  ads: Schema.Boolean,
  doNotDisturb: Schema.Boolean,
  doNotDisturbStart: Schema.NullOr(Schema.String),
  doNotDisturbEnd: Schema.NullOr(Schema.String),
  historyViewCount: Schema.Number,
  role: UserRole,
  status: UserStatus,
  timezone: Schema.NullOr(Schema.String),
  preferredNotificationTime: Schema.NullOr(Schema.String),
  publicProfile: Schema.Boolean,
  shareGrowthData: Schema.Boolean,
  personalizedTips: Schema.Boolean,
  language: LanguageCode,
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
  name: Schema.NullOr(Schema.String),
  email: Schema.String,
  image: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.String), // Will default to empty string for now
  notifications: Schema.Struct({
    careReminders: Schema.Boolean,
    weeklyDigest: Schema.Boolean,
    achievements: Schema.Boolean,
    tips: Schema.Boolean,
    productUpdates: Schema.Boolean,
    ads: Schema.Boolean,
    doNotDisturb: Schema.Boolean,
    doNotDisturbStart: Schema.String,
    doNotDisturbEnd: Schema.String,
  }),
  privacy: Schema.Struct({
    publicProfile: Schema.Boolean,
    shareGrowthData: Schema.Boolean,
    personalizedTips: Schema.Boolean,
  }),
  timezone: Schema.NullOr(Schema.String),
  preferredNotificationTime: Schema.NullOr(Schema.String),
  language: LanguageCode,
})

export const UserSettingsUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.String),
  notifications: Schema.optional(
    Schema.Struct({
      careReminders: Schema.optional(Schema.Boolean),
      weeklyDigest: Schema.optional(Schema.Boolean),
      achievements: Schema.optional(Schema.Boolean),
      tips: Schema.optional(Schema.Boolean),
      productUpdates: Schema.optional(Schema.Boolean),
      ads: Schema.optional(Schema.Boolean),
      doNotDisturb: Schema.optional(Schema.Boolean),
      doNotDisturbStart: Schema.optional(Schema.String),
      doNotDisturbEnd: Schema.optional(Schema.String),
    })
  ),
  privacy: Schema.optional(
    Schema.Struct({
      publicProfile: Schema.optional(Schema.Boolean),
      shareGrowthData: Schema.optional(Schema.Boolean),
      personalizedTips: Schema.optional(Schema.Boolean),
    })
  ),
  timezone: Schema.optional(Schema.String),
  preferredNotificationTime: Schema.optional(Schema.String),
  language: Schema.optional(LanguageCode),
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
