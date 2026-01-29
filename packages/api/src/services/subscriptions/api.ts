import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  PaymentProviderError,
  SubscriptionInfo,
  TierConfig,
} from '@lily/shared'
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
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /subscriptions/tiers - Get all available tiers
    HttpApiEndpoint.get('getTiers')`/tiers`
      .addSuccess(Schema.Array(TierConfig))
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
  )
  .prefix('/subscriptions')
