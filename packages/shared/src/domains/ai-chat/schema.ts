import { Schema } from 'effect'

// AI chat schemas
export const ChatMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Union(Schema.Literal('user'), Schema.Literal('assistant')),
  content: Schema.String,
  imageUrl: Schema.optional(Schema.String),
  plantId: Schema.String,
  userId: Schema.String,
  createdAt: Schema.Date,
})

export const ChatRequest = Schema.Struct({
  message: Schema.optional(Schema.String),
  // Note: file upload would be handled via multipart/form-data in actual implementation
})

export const ChatResponse = Schema.Struct({
  message: ChatMessage,
  response: Schema.String,
})

// Type exports
export type ChatMessage = typeof ChatMessage.Type
export type ChatRequest = typeof ChatRequest.Type
export type ChatResponse = typeof ChatResponse.Type
