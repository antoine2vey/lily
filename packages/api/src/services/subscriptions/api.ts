import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  PaymentProviderError,
  SubscriptionInfo,
  TierConfig,
} from '@lily/shared'
import {
  RedeemGiftCodeRequest,
  RedeemGiftCodeResponse,
} from '@lily/shared/admin'
import {
  GiftCodeAlreadyRedeemedError,
  GiftCodeExhaustedError,
  GiftCodeExpiredError,
  GiftCodeInactiveError,
  GiftCodeNotFoundError,
} from '@lily/shared/errors/gift-code'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// RevenueCat webhook headers - authorization bearer token
const RevenueCatWebhookHeaders = Schema.Struct({
  authorization: Schema.optional(Schema.String),
})

// Authenticated subscription endpoints
export const SubscriptionsApi = HttpApiGroup.make('subscriptions')
  .add(
    // GET /subscriptions/current - Get current subscription status
    HttpApiEndpoint.get('getCurrentSubscription', '/current', {
      success: SubscriptionInfo,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    // GET /subscriptions/tiers - Get all available tiers
    HttpApiEndpoint.get('getTiers', '/tiers', {
      success: Schema.Array(TierConfig),
    })
  )
  .add(
    // POST /subscriptions/redeem-code - Redeem a gift code
    HttpApiEndpoint.post('redeemGiftCode', '/redeem-code', {
      payload: RedeemGiftCodeRequest,
      success: RedeemGiftCodeResponse,
      error: [
        GiftCodeNotFoundError,
        GiftCodeInactiveError,
        GiftCodeExpiredError,
        GiftCodeExhaustedError,
        GiftCodeAlreadyRedeemedError,
      ],
    })
  )
  .prefix('/subscriptions')
  .middleware(Authentication)

// Unauthenticated webhook endpoint (separate group)
export const SubscriptionWebhooksApi = HttpApiGroup.make(
  'subscription-webhooks'
)
  .add(
    // POST /subscriptions/webhook/revenuecat - Handle RevenueCat webhooks (no auth)
    HttpApiEndpoint.post('handleRevenueCatWebhook', '/webhook/revenuecat', {
      headers: RevenueCatWebhookHeaders,
      success: Schema.Struct({ received: Schema.Boolean }),
      error: PaymentProviderError.pipe(HttpApiSchema.status(400)),
    })
  )
  .prefix('/subscriptions')
