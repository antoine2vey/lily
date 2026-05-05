import { Schema } from 'effect'
import { PaginationParams } from '../common/pagination'
import {
  SubscriptionEventType,
  SubscriptionStatus,
  SubscriptionTier,
} from '../subscriptions/schema'
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

// --- Gift History schemas ---

export const AdminGiftEvent = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  userName: Schema.NullOr(Schema.String),
  userEmail: Schema.String,
  eventType: SubscriptionEventType,
  metadata: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
})
export type AdminGiftEvent = typeof AdminGiftEvent.Type

// --- Gift Revoke schemas ---

export const AdminRevokeGiftResponse = Schema.Struct({
  message: Schema.String,
  userId: Schema.String,
  tier: SubscriptionTier,
  status: SubscriptionStatus,
})
export type AdminRevokeGiftResponse = typeof AdminRevokeGiftResponse.Type

// --- Gift Subscription schemas ---

export const GiftDuration = Schema.Literal('7d', '1m', '1y', 'infinite')
export type GiftDuration = typeof GiftDuration.Type

export const GIFT_DURATION_LABELS: Record<
  string,
  Record<GiftDuration, string>
> = {
  en: {
    '7d': '7 Days',
    '1m': '1 Month',
    '1y': '1 Year',
    infinite: 'Lifetime',
  },
  fr: {
    '7d': '7 Jours',
    '1m': '1 Mois',
    '1y': '1 An',
    infinite: 'À Vie',
  },
}

export const AdminGiftSubscriptionRequest = Schema.Struct({
  duration: GiftDuration,
})
export type AdminGiftSubscriptionRequest =
  typeof AdminGiftSubscriptionRequest.Type

export const AdminGiftSubscriptionResponse = Schema.Struct({
  message: Schema.String,
  userId: Schema.String,
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  periodStart: Schema.Date,
  periodEnd: Schema.Date,
})
export type AdminGiftSubscriptionResponse =
  typeof AdminGiftSubscriptionResponse.Type

// --- Live Activity diagnostic ---

// Per-token outcome from a manual LA-start trigger. The `kind` distinguishes
// successful APNs handoff from the various failure modes so the operator can
// tell at a glance whether the issue is server-side or device-side.
export const AdminLiveActivityTriggerOutcome = Schema.Struct({
  deviceTokenId: Schema.String,
  kind: Schema.Literal(
    'accepted',
    'send-error',
    'config-error',
    'token-invalidated'
  ),
  apnsId: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
})
export type AdminLiveActivityTriggerOutcome =
  typeof AdminLiveActivityTriggerOutcome.Type

export const AdminLiveActivityTriggerResponse = Schema.Struct({
  userId: Schema.String,
  activityId: Schema.String,
  // Null when there's nothing due today; the LA payload would be empty.
  contentStateBuilt: Schema.Boolean,
  startTokenCount: Schema.Number,
  outcomes: Schema.Array(AdminLiveActivityTriggerOutcome),
})
export type AdminLiveActivityTriggerResponse =
  typeof AdminLiveActivityTriggerResponse.Type

// --- Gift Code schemas ---

export const GiftCode = Schema.Struct({
  id: Schema.String,
  code: Schema.String,
  duration: GiftDuration,
  maxUsages: Schema.Number,
  currentUsages: Schema.Number,
  isActive: Schema.Boolean,
  expiresAt: Schema.NullOr(Schema.DateFromString),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type GiftCode = typeof GiftCode.Type

export const GiftCodeCreateRequest = Schema.Struct({
  code: Schema.String,
  duration: GiftDuration,
  maxUsages: Schema.Number,
  expiresAt: Schema.optional(Schema.DateFromString),
})
export type GiftCodeCreateRequest = typeof GiftCodeCreateRequest.Type

export const GiftCodeUpdateRequest = Schema.Struct({
  code: Schema.optional(Schema.String),
  duration: Schema.optional(GiftDuration),
  maxUsages: Schema.optional(Schema.Number),
  isActive: Schema.optional(Schema.Boolean),
  expiresAt: Schema.optional(Schema.NullOr(Schema.DateFromString)),
})
export type GiftCodeUpdateRequest = typeof GiftCodeUpdateRequest.Type

export const GiftCodeRedemption = Schema.Struct({
  id: Schema.String,
  giftCodeId: Schema.String,
  userId: Schema.String,
  userName: Schema.NullOr(Schema.String),
  userEmail: Schema.String,
  redeemedAt: Schema.DateFromString,
})
export type GiftCodeRedemption = typeof GiftCodeRedemption.Type

export const GiftCodeWithRedemptions = Schema.Struct({
  ...GiftCode.fields,
  redemptions: Schema.Array(GiftCodeRedemption),
})
export type GiftCodeWithRedemptions = typeof GiftCodeWithRedemptions.Type

export const RedeemGiftCodeRequest = Schema.Struct({
  code: Schema.String,
})
export type RedeemGiftCodeRequest = typeof RedeemGiftCodeRequest.Type

export const RedeemGiftCodeResponse = Schema.Struct({
  message: Schema.String,
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  periodStart: Schema.Date,
  periodEnd: Schema.Date,
})
export type RedeemGiftCodeResponse = typeof RedeemGiftCodeResponse.Type

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
