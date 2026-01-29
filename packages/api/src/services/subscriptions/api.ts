import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  PaymentProviderError,
  SubscriptionInfo,
  SubscriptionNotFoundError,
  TierConfig,
} from '@lily/shared'
import { DatabaseError } from '@lily/shared/errors/database'
import { Schema } from 'effect'

// RevenueCat webhook headers - authorization bearer token
const RevenueCatWebhookHeaders = Schema.Struct({
  authorization: Schema.optional(Schema.String),
})

// Authenticated subscription endpoints
export const SubscriptionsApi = HttpApiGroup.make('subscriptions')
  .add(
    // GET /subscriptions/current - Get current subscription status
    HttpApiEndpoint.get('getCurrentSubscription')`/current`
      .addSuccess(SubscriptionInfo)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /subscriptions/tiers - Get all available tiers
    HttpApiEndpoint.get('getTiers')`/tiers`
      .addSuccess(Schema.Array(TierConfig))
      .addError(DatabaseError, { status: 500 })
  )
  .add(
    // POST /subscriptions/cancel - Cancel subscription
    HttpApiEndpoint.post('cancelSubscription')`/cancel`
      .addSuccess(Schema.Struct({ message: Schema.String }))
      .addError(DatabaseError, { status: 500 })
      .addError(SubscriptionNotFoundError, { status: 404 })
      .addError(PaymentProviderError, { status: 502 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /subscriptions/sync - Sync subscription from RevenueCat
    // Called by app after purchase to ensure backend is updated
    HttpApiEndpoint.post('syncSubscription')`/sync`
      .addSuccess(SubscriptionInfo)
      .addError(DatabaseError, { status: 500 })
      .addError(PaymentProviderError, { status: 502 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/subscriptions')
  .middleware(Authentication)

// Unauthenticated webhook endpoint (separate group)
export const SubscriptionWebhooksApi = HttpApiGroup.make(
  'subscription-webhooks'
)
  .add(
    // POST /subscriptions/webhook/revenuecat - Handle RevenueCat webhooks (no auth)
    HttpApiEndpoint.post('handleRevenueCatWebhook')`/webhook/revenuecat`
      .setHeaders(RevenueCatWebhookHeaders)
      .addSuccess(Schema.Struct({ received: Schema.Boolean }))
      .addError(PaymentProviderError, { status: 400 })
      .addError(DatabaseError, { status: 500 })
  )
  .prefix('/subscriptions')
