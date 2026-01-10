import { Schema } from 'effect'

// Enums
export const SubscriptionTier = Schema.Literal('free', 'paid')
export type SubscriptionTier = typeof SubscriptionTier.Type

export const SubscriptionStatus = Schema.Literal(
  'active',
  'trialing',
  'canceled',
  'expired',
  'past_due'
)
export type SubscriptionStatus = typeof SubscriptionStatus.Type

// Tier configuration
export const TierConfig = Schema.Struct({
  tier: SubscriptionTier,
  name: Schema.String,
  priceMonthly: Schema.Number,
  maxPlants: Schema.NullOr(Schema.Number),
  maxAiChatsMonthly: Schema.NullOr(Schema.Number),
  maxCardScansMonthly: Schema.NullOr(Schema.Number),
  maxPlantIdentifiesMonthly: Schema.NullOr(Schema.Number),
})
export type TierConfig = typeof TierConfig.Type

// Subscription
export const Subscription = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  trialStartsAt: Schema.NullOr(Schema.Date),
  trialEndsAt: Schema.NullOr(Schema.Date),
  currentPeriodStart: Schema.Date,
  currentPeriodEnd: Schema.Date,
  canceledAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})
export type Subscription = typeof Subscription.Type

// Usage tracking
export const SubscriptionUsage = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  periodStart: Schema.Date,
  periodEnd: Schema.Date,
  aiChatsCount: Schema.Number,
  cardScansCount: Schema.Number,
  plantIdentifiesCount: Schema.Number,
})
export type SubscriptionUsage = typeof SubscriptionUsage.Type

// Usage counts (subset for API response)
export const UsageCounts = Schema.Struct({
  aiChatsCount: Schema.Number,
  cardScansCount: Schema.Number,
  plantIdentifiesCount: Schema.Number,
})
export type UsageCounts = typeof UsageCounts.Type

// Combined subscription info (for API response)
export const SubscriptionInfo = Schema.Struct({
  subscription: Schema.NullOr(Subscription),
  usage: Schema.NullOr(UsageCounts),
  tierConfig: TierConfig,
})
export type SubscriptionInfo = typeof SubscriptionInfo.Type

// Request schemas
export const CreateCheckoutSessionRequest = Schema.Struct({
  successUrl: Schema.String,
  cancelUrl: Schema.String,
})
export type CreateCheckoutSessionRequest =
  typeof CreateCheckoutSessionRequest.Type

// Response schemas
export const CheckoutSessionResponse = Schema.Struct({
  sessionId: Schema.String,
  url: Schema.String,
})
export type CheckoutSessionResponse = typeof CheckoutSessionResponse.Type

export const CancelSubscriptionResponse = Schema.Struct({
  subscription: Subscription,
  message: Schema.String,
})
export type CancelSubscriptionResponse = typeof CancelSubscriptionResponse.Type

// Usage field type for tracking
export const UsageField = Schema.Literal(
  'aiChats',
  'cardScans',
  'plantIdentifies'
)
export type UsageField = typeof UsageField.Type
