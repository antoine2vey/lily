import { Schema } from 'effect'

export const MessageResponse = Schema.Struct({
  message: Schema.String,
})

export const ErrorResponse = Schema.Struct({
  error: Schema.String,
})

export type MessageResponse = typeof MessageResponse.Type
export type ErrorResponse = typeof ErrorResponse.Type
