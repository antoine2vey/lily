import { Schema } from 'effect'

// Enums
export const SubscriptionTier = Schema.Literals(['free', 'paid'])
export type SubscriptionTier = typeof SubscriptionTier.Type

export const SubscriptionStatus = Schema.Literals([
  'active',
  'trialing',
  'canceled',
  'expired',
  'past_due',
])
export type SubscriptionStatus = typeof SubscriptionStatus.Type

export const PaymentProvider = Schema.Literal('revenuecat')
export type PaymentProvider = typeof PaymentProvider.Type

export const AppStore = Schema.Literals(['APP_STORE', 'PLAY_STORE'])
export type AppStore = typeof AppStore.Type

export const SubscriptionEventType = Schema.Literals([
  'subscription_created',
  'subscription_updated',
  'subscription_canceled',
  'subscription_gifted',
  'subscription_gift_revoked',
  'trial_started',
  'trial_ended',
  'payment_succeeded',
  'payment_failed',
  'usage_limit_reached',
  'gift_code_redeemed',
])
export type SubscriptionEventType = typeof SubscriptionEventType.Type

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
  provider: Schema.optional(PaymentProvider),
  productId: Schema.optional(Schema.String),
  store: Schema.optional(AppStore),
  trialStartsAt: Schema.NullOr(Schema.DateFromString),
  trialEndsAt: Schema.NullOr(Schema.DateFromString),
  currentPeriodStart: Schema.DateFromString,
  currentPeriodEnd: Schema.DateFromString,
  canceledAt: Schema.NullOr(Schema.DateFromString),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type Subscription = typeof Subscription.Type

// Usage tracking
export const SubscriptionUsage = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  periodStart: Schema.DateFromString,
  periodEnd: Schema.DateFromString,
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

// Response schemas
export const CancelSubscriptionResponse = Schema.Struct({
  subscription: Subscription,
  message: Schema.String,
})
export type CancelSubscriptionResponse = typeof CancelSubscriptionResponse.Type

// Usage field type for tracking
export const UsageField = Schema.Literals([
  'aiChats',
  'cardScans',
  'plantIdentifies',
])
export type UsageField = typeof UsageField.Type
