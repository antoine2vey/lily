import { Schema } from 'effect'

// Common response schemas
export const MessageResponse = Schema.Struct({
  message: Schema.String,
})

export const ErrorResponse = Schema.Struct({
  error: Schema.String,
})

// Type exports
export type MessageResponse = typeof MessageResponse.Type
export type ErrorResponse = typeof ErrorResponse.Type
