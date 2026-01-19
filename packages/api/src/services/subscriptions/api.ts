import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CheckoutSessionResponse,
  CreateCheckoutSessionRequest,
  PaymentProviderError,
  SubscriptionInfo,
  SubscriptionNotFoundError,
  TierConfig,
} from '@lily/shared'
import { DatabaseError } from '@lily/shared/errors/database'
import { Schema } from 'effect'

// Webhook headers - stripe signature
const WebhookHeaders = Schema.Struct({
  'stripe-signature': Schema.String,
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
    // POST /subscriptions/checkout - Create checkout session
    HttpApiEndpoint.post('createCheckoutSession')`/checkout`
      .setPayload(CreateCheckoutSessionRequest)
      .addSuccess(CheckoutSessionResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(PaymentProviderError, { status: 502 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
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
  .prefix('/subscriptions')
  .middleware(Authentication)

// Unauthenticated webhook endpoint (separate group)
export const SubscriptionWebhooksApi = HttpApiGroup.make(
  'subscription-webhooks'
)
  .add(
    // POST /subscriptions/webhook - Handle payment provider webhooks (no auth)
    HttpApiEndpoint.post('handleWebhook')`/webhook`
      .setHeaders(WebhookHeaders)
      .addSuccess(Schema.Struct({ received: Schema.Boolean }))
      .addError(PaymentProviderError, { status: 400 })
      .addError(DatabaseError, { status: 500 })
  )
  .prefix('/subscriptions')
