import { getCurrentSubscription } from '@lily/api/services/subscriptions/endpoints/get-current-subscription'
import { getTiers } from '@lily/api/services/subscriptions/endpoints/get-tiers'
import { handleRevenueCatWebhook } from '@lily/api/services/subscriptions/endpoints/webhook/handle-revenuecat-webhook'
import { Effect } from 'effect'

// Re-export for backwards compatibility (alias)
export type { SubscriptionInfo as SubscriptionInfoResult } from '@lily/shared'

// Subscription service implementation following the endpoints pattern
export class SubscriptionService extends Effect.Service<SubscriptionService>()(
  'SubscriptionService',
  {
    effect: Effect.succeed({
      getCurrentSubscription,
      handleRevenueCatWebhookEvent: handleRevenueCatWebhook,
      getAllTiers: getTiers,
    }),
  }
) {}
