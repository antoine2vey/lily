import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

export const CHAT_MESSAGE_MAX_LENGTH = 4000
export const CHAT_TITLE_MAX_LENGTH = 200

// Conversation kind: free-form ('general') or scoped to a specific plant
export const ChatConversationKind = Schema.Literals(['general', 'plant'])
export type ChatConversationKind = typeof ChatConversationKind.Type

// A conversation groups one or more messages
export const ChatConversation = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  kind: ChatConversationKind,
  plantId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  createdAt: Schema.DateFromString,
  lastMessageAt: Schema.DateFromString,
})
export type ChatConversation = typeof ChatConversation.Type

// AI chat message — now scoped by conversationId, no longer plantId
export const ChatMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Union([Schema.Literal('user'), Schema.Literal('assistant')]),
  content: Schema.String,
  imageUrl: Schema.optional(Schema.String),
  parts: Schema.optional(Schema.Array(Schema.Unknown)),
  conversationId: Schema.String,
  userId: Schema.String,
  createdAt: Schema.DateFromString,
})

// Body for POST /chat/conversations
export const CreateConversationRequest = Schema.Struct({
  kind: ChatConversationKind,
  plantId: Schema.optional(Schema.String),
  title: Schema.optional(
    Schema.String.check(Schema.isMaxLength(CHAT_TITLE_MAX_LENGTH))
  ),
})
export type CreateConversationRequest = typeof CreateConversationRequest.Type

// Paginated lists
export const ChatHistoryListResponse = PaginatedResponse(ChatMessage)
export type ChatHistoryListResponse = typeof ChatHistoryListResponse.Type

export const ChatConversationListResponse = PaginatedResponse(ChatConversation)
export type ChatConversationListResponse =
  typeof ChatConversationListResponse.Type

export const ChatStarterPlant = Schema.Struct({
  plantId: Schema.String,
  name: Schema.String,
  imageUrl: Schema.optional(Schema.String),
})
export type ChatStarterPlant = typeof ChatStarterPlant.Type

export const ChatStarters = Schema.Struct({
  plants: Schema.Array(ChatStarterPlant),
})
export type ChatStarters = typeof ChatStarters.Type

export const ChatSuggestion = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
})
export type ChatSuggestion = typeof ChatSuggestion.Type

export const ChatSuggestions = Schema.Struct({
  suggestions: Schema.Array(ChatSuggestion),
})
export type ChatSuggestions = typeof ChatSuggestions.Type

// Type exports
export type ChatMessage = typeof ChatMessage.Type
