import { Schema } from 'effect'

import { LanguageCode, UserRole, UserStatus } from '../user/schema'

// Auth request schemas
export const MagicLinkRequest = Schema.Struct({
  email: Schema.String,
  language: Schema.optional(LanguageCode),
})

export const MagicLinkVerifyRequest = Schema.Struct({
  code: Schema.String,
  timezone: Schema.optional(Schema.String),
  language: Schema.optional(LanguageCode),
})

export const UsernameRequest = Schema.Struct({
  username: Schema.String,
})

export const OAuthProvider = Schema.Literal('apple', 'google')
export type OAuthProvider = typeof OAuthProvider.Type

export const OAuthFullName = Schema.Struct({
  givenName: Schema.optional(Schema.NullOr(Schema.String)),
  familyName: Schema.optional(Schema.NullOr(Schema.String)),
})

export const OAuthSignInRequest = Schema.Struct({
  provider: OAuthProvider,
  idToken: Schema.String,
  fullName: Schema.optional(OAuthFullName),
  timezone: Schema.optional(Schema.String),
  language: Schema.optional(LanguageCode),
})
export type OAuthSignInRequest = typeof OAuthSignInRequest.Type

export const RefreshTokenRequest = Schema.Struct({
  refreshToken: Schema.String,
})

export const UserProfile = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.NullOr(Schema.String),
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
  username: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  role: UserRole,
  status: UserStatus,
})

// Auth response schemas
export const AuthResponse = Schema.Struct({
  user: UserProfile,
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresIn: Schema.Number,
})

export const RefreshTokenResponse = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresIn: Schema.Number,
})

export const MagicLinkSentResponse = Schema.Struct({
  message: Schema.String,
  instantCode: Schema.optional(Schema.String),
})

export const LogoutResponse = Schema.Struct({
  message: Schema.String,
})

// Type exports
export type MagicLinkRequest = typeof MagicLinkRequest.Type
export type MagicLinkVerifyRequest = typeof MagicLinkVerifyRequest.Type
export type UsernameRequest = typeof UsernameRequest.Type
export type RefreshTokenRequest = typeof RefreshTokenRequest.Type
export type AuthResponse = typeof AuthResponse.Type
export type RefreshTokenResponse = typeof RefreshTokenResponse.Type
export type UserProfile = typeof UserProfile.Type
export type MagicLinkSentResponse = typeof MagicLinkSentResponse.Type
export type LogoutResponse = typeof LogoutResponse.Type
