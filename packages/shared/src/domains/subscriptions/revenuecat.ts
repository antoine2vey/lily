import { Schema } from 'effect'

// RevenueCat Event Types
export const RevenueCatEventType = Schema.Literal(
  'TEST',
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIBER_ALIAS'
)
export type RevenueCatEventType = typeof RevenueCatEventType.Type

// Store type
export const RevenueCatStore = Schema.Literal(
  'APP_STORE',
  'PLAY_STORE',
  'STRIPE',
  'PROMOTIONAL'
)
export type RevenueCatStore = typeof RevenueCatStore.Type

// Environment type
export const RevenueCatEnvironment = Schema.Literal('SANDBOX', 'PRODUCTION')
export type RevenueCatEnvironment = typeof RevenueCatEnvironment.Type

// Period type
export const RevenueCatPeriodType = Schema.Literal(
  'TRIAL',
  'INTRO',
  'NORMAL',
  'PROMOTIONAL'
)
export type RevenueCatPeriodType = typeof RevenueCatPeriodType.Type

// Webhook event inner structure
export const RevenueCatWebhookEventData = Schema.Struct({
  type: RevenueCatEventType,
  id: Schema.String,
  app_user_id: Schema.String,
  original_app_user_id: Schema.String,
  aliases: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  product_id: Schema.String,
  entitlement_ids: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  store: RevenueCatStore,
  environment: RevenueCatEnvironment,
  purchased_at_ms: Schema.Number,
  expiration_at_ms: Schema.NullOr(Schema.Number),
  // Trial and period info
  is_trial_period: Schema.optional(Schema.NullOr(Schema.Boolean)),
  period_type: Schema.optional(Schema.NullOr(RevenueCatPeriodType)),
  // Price info
  price: Schema.optional(Schema.NullOr(Schema.Number)),
  price_in_purchased_currency: Schema.optional(Schema.NullOr(Schema.Number)),
  currency: Schema.optional(Schema.NullOr(Schema.String)),
  // Cancellation info
  cancel_reason: Schema.optional(Schema.NullOr(Schema.String)),
  // Subscriber attributes
  subscriber_attributes: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
  ),
  // Transaction IDs
  transaction_id: Schema.optional(Schema.NullOr(Schema.String)),
  original_transaction_id: Schema.optional(Schema.NullOr(Schema.String)),
})
export type RevenueCatWebhookEventData = typeof RevenueCatWebhookEventData.Type

// Full webhook payload
export const RevenueCatWebhookEvent = Schema.Struct({
  api_version: Schema.String,
  event: RevenueCatWebhookEventData,
})
export type RevenueCatWebhookEvent = typeof RevenueCatWebhookEvent.Type

// Subscriber info from RevenueCat API (simplified)
export const RevenueCatEntitlement = Schema.Struct({
  expires_date: Schema.NullOr(Schema.String),
  grace_period_expires_date: Schema.NullOr(Schema.String),
  product_identifier: Schema.String,
  purchase_date: Schema.String,
  original_purchase_date: Schema.optional(Schema.String),
  store: RevenueCatStore,
  is_sandbox: Schema.Boolean,
  unsubscribe_detected_at: Schema.NullOr(Schema.String),
  billing_issues_detected_at: Schema.NullOr(Schema.String),
})
export type RevenueCatEntitlement = typeof RevenueCatEntitlement.Type

export const RevenueCatSubscriberInfo = Schema.Struct({
  request_date: Schema.String,
  request_date_ms: Schema.Number,
  subscriber: Schema.Struct({
    original_app_user_id: Schema.String,
    first_seen: Schema.String,
    entitlements: Schema.Record({
      key: Schema.String,
      value: RevenueCatEntitlement,
    }),
    subscriptions: Schema.Record({
      key: Schema.String,
      value: Schema.Struct({
        expires_date: Schema.NullOr(Schema.String),
        grace_period_expires_date: Schema.NullOr(Schema.String),
        purchase_date: Schema.String,
        original_purchase_date: Schema.String,
        store: RevenueCatStore,
        is_sandbox: Schema.Boolean,
        unsubscribe_detected_at: Schema.NullOr(Schema.String),
        billing_issues_detected_at: Schema.NullOr(Schema.String),
        period_type: Schema.optional(RevenueCatPeriodType),
      }),
    }),
    non_subscriptions: Schema.Record({
      key: Schema.String,
      value: Schema.Array(Schema.Unknown),
    }),
  }),
})
export type RevenueCatSubscriberInfo = typeof RevenueCatSubscriberInfo.Type

// Request schema for sync endpoint
export const SyncSubscriptionRequest = Schema.Struct({})
export type SyncSubscriptionRequest = typeof SyncSubscriptionRequest.Type

// Webhook headers schema
export const RevenueCatWebhookHeaders = Schema.Struct({
  authorization: Schema.optional(Schema.String),
})
export type RevenueCatWebhookHeaders = typeof RevenueCatWebhookHeaders.Type
