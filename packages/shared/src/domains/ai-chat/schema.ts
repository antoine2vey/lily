import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

// Conversation kind: free-form ('general') or scoped to a specific plant
export const ChatConversationKind = Schema.Literal('general', 'plant')
export type ChatConversationKind = typeof ChatConversationKind.Type

// A conversation groups one or more messages
export const ChatConversation = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  kind: ChatConversationKind,
  plantId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  lastMessageAt: Schema.Date,
})
export type ChatConversation = typeof ChatConversation.Type

// AI chat message — now scoped by conversationId, no longer plantId
export const ChatMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Union(Schema.Literal('user'), Schema.Literal('assistant')),
  content: Schema.String,
  imageUrl: Schema.optional(Schema.String),
  parts: Schema.optional(Schema.Array(Schema.Unknown)),
  conversationId: Schema.String,
  userId: Schema.String,
  createdAt: Schema.Date,
})

// Body for POST /chat/conversations
export const CreateConversationRequest = Schema.Struct({
  kind: ChatConversationKind,
  plantId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
})
export type CreateConversationRequest = typeof CreateConversationRequest.Type

// Paginated lists
export const ChatHistoryListResponse = PaginatedResponse(ChatMessage)
export type ChatHistoryListResponse = typeof ChatHistoryListResponse.Type

export const ChatConversationListResponse = PaginatedResponse(ChatConversation)
export type ChatConversationListResponse =
  typeof ChatConversationListResponse.Type

// Type exports
export type ChatMessage = typeof ChatMessage.Type
