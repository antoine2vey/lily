import { Schema } from 'effect'

// Auth request schemas
export const MagicLinkRequest = Schema.Struct({
  email: Schema.String,
})

export const MagicLinkVerifyRequest = Schema.Struct({
  token: Schema.String,
})

export const UsernameRequest = Schema.Struct({
  username: Schema.String,
})

export const UserProfile = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  username: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

// Auth response schemas
export const AuthResponse = Schema.Struct({
  user: UserProfile,
  token: Schema.String,
})

// Type exports
export type MagicLinkRequest = typeof MagicLinkRequest.Type
export type MagicLinkVerifyRequest = typeof MagicLinkVerifyRequest.Type
export type UsernameRequest = typeof UsernameRequest.Type
export type AuthResponse = typeof AuthResponse.Type
export type UserProfile = typeof UserProfile.Type
