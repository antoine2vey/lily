import { Schema } from 'effect'
import { z } from 'zod'

// Zod schemas for validation
export const ResendVerificationRequestZod = z.object({
  email: z.string().email('Invalid email format'),
})

export const VerifyEmailRequestZod = z.object({
  token: z.string().min(1, 'Token is required'),
})

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

export const ResendVerificationRequest = Schema.Struct({
  email: Schema.String,
})

export const VerifyEmailRequest = Schema.Struct({
  token: Schema.String,
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

export const VerifyEmailResponse = Schema.Struct({
  user: UserProfile,
  verified: Schema.Boolean,
})

export const ResendVerificationResponse = Schema.Struct({
  message: Schema.String,
})

// Type exports
export type MagicLinkRequest = typeof MagicLinkRequest.Type
export type MagicLinkVerifyRequest = typeof MagicLinkVerifyRequest.Type
export type UsernameRequest = typeof UsernameRequest.Type
export type AuthResponse = typeof AuthResponse.Type
export type UserProfile = typeof UserProfile.Type
export type ResendVerificationRequest = z.infer<
  typeof ResendVerificationRequestZod
>
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestZod>
export type VerifyEmailResponse = typeof VerifyEmailResponse.Type
export type ResendVerificationResponse = typeof ResendVerificationResponse.Type
