import { Schema } from 'effect'
import { PaginationParams } from '../common/pagination'
import { User, UserRole, UserStatus } from '../user/schema'

// Admin user list request - pagination with filters
export const AdminUserListParams = Schema.Struct({
  ...PaginationParams.fields,
  role: Schema.optional(UserRole),
  status: Schema.optional(UserStatus),
  search: Schema.optional(Schema.String),
})

// Admin update user request - all editable fields
export const AdminUserUpdateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.NullOr(Schema.String)),
  image: Schema.optional(Schema.NullOr(Schema.String)),
  emailVerified: Schema.optional(Schema.Boolean),
  status: Schema.optional(UserStatus),
})

// Role change request
export const AdminRoleChangeRequest = Schema.Struct({
  role: UserRole,
})

// Status change request
export const AdminStatusChangeRequest = Schema.Struct({
  status: UserStatus,
})

// Re-export User as AdminUser for clarity in admin context
export { User as AdminUser }

// --- Prompt Preview schemas ---

export const PromptPreviewMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Union(Schema.Literal('user'), Schema.Literal('assistant')),
  content: Schema.String,
  createdAt: Schema.Date,
})

export const PromptPreviewPlant = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  category: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  health: Schema.String,
  humidityRating: Schema.Number,
  lightingRating: Schema.Number,
  wateringRating: Schema.Number,
  petToxicityRating: Schema.Number,
  wateringFrequencyDays: Schema.Number,
  lastWateredAt: Schema.NullOr(Schema.String),
  nextWateringAt: Schema.NullOr(Schema.String),
  fertilizationFrequencyDays: Schema.NullOr(Schema.Number),
  lastFertilizedAt: Schema.NullOr(Schema.String),
  nextFertilizationAt: Schema.NullOr(Schema.String),
  dateAdded: Schema.String,
  daysSinceAdded: Schema.Number,
})

export const PromptPreviewCareEntry = Schema.Struct({
  type: Schema.String,
  date: Schema.String,
  notes: Schema.NullOr(Schema.String),
})

export const PromptPreviewRagChunk = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  source: Schema.String,
  sourceUrl: Schema.optional(Schema.String),
  plantType: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Unknown),
  similarity: Schema.Number,
})

export const PromptPreviewConversationEntry = Schema.Struct({
  role: Schema.Union(Schema.Literal('user'), Schema.Literal('assistant')),
  content: Schema.String,
  createdAt: Schema.Date,
})

export const PromptPreviewRequest = Schema.Struct({
  messageId: Schema.String,
})

export const PromptPreviewResponse = Schema.Struct({
  message: PromptPreviewMessage,
  plant: PromptPreviewPlant,
  careHistory: Schema.Array(PromptPreviewCareEntry),
  ragQuery: Schema.String,
  ragChunks: Schema.Array(PromptPreviewRagChunk),
  formattedRagContext: Schema.String,
  conversationHistory: Schema.Array(PromptPreviewConversationEntry),
  systemPrompt: Schema.String,
  model: Schema.String,
  hasImage: Schema.Boolean,
})

// Type exports
export type AdminUserListParams = typeof AdminUserListParams.Type
export type AdminUserUpdateRequest = typeof AdminUserUpdateRequest.Type
export type AdminRoleChangeRequest = typeof AdminRoleChangeRequest.Type
export type AdminStatusChangeRequest = typeof AdminStatusChangeRequest.Type
export type PromptPreviewMessage = typeof PromptPreviewMessage.Type
export type PromptPreviewPlant = typeof PromptPreviewPlant.Type
export type PromptPreviewCareEntry = typeof PromptPreviewCareEntry.Type
export type PromptPreviewRagChunk = typeof PromptPreviewRagChunk.Type
export type PromptPreviewConversationEntry =
  typeof PromptPreviewConversationEntry.Type
export type PromptPreviewRequest = typeof PromptPreviewRequest.Type
export type PromptPreviewResponse = typeof PromptPreviewResponse.Type
