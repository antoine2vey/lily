import { Schema } from 'effect'

// Auth request schemas
export const MagicLinkRequest = Schema.Struct({
  email: Schema.String,
})

export const MagicLinkVerifyRequest = Schema.Struct({
  code: Schema.String,
})

export const UsernameRequest = Schema.Struct({
  username: Schema.String,
})

export const RefreshTokenRequest = Schema.Struct({
  refreshToken: Schema.String,
})

export const UserProfile = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.NullOr(Schema.String),
  username: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  role: Schema.Literal('user', 'admin'),
  status: Schema.Literal('active', 'suspended', 'banned'),
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
  expiresIn: Schema.Number,
})

export const MagicLinkSentResponse = Schema.Struct({
  message: Schema.String,
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
