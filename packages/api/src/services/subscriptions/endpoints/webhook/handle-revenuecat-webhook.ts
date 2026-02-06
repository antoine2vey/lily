import type { SqlError } from '@effect/sql/SqlError'
import type { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { handleBillingIssue } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-billing-issue'
import { handleCancellation } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-cancellation'
import { handleExpiration } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-expiration'
import { handleInitialPurchase } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-initial-purchase'
import { handleProductChange } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-product-change'
import { handleRenewal } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-renewal'
import { handleUncancellation } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-uncancellation'
import {
  mapEventToStatus,
  mapRevenueCatStore,
  type WebhookEventContext,
} from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { RevenueCatProvider } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import type { PaymentProviderError } from '@lily/shared'
import { DateTime, Duration, Effect, Match, pipe } from 'effect'

export const handleRevenueCatWebhook = (
  payload: string,
  authorization: string | undefined
): Effect.Effect<
  void,
  PaymentProviderError | SqlError,
  RevenueCatProvider | SubscriptionRepository
> =>
  Effect.gen(function* () {
    const revenueCatProvider = yield* RevenueCatProvider

    // Validate and parse the webhook event
    const event = yield* revenueCatProvider.constructWebhookEvent(
      payload,
      authorization
    )

    const eventData = event.event
    const userId = eventData.app_user_id
    const productId = eventData.product_id
    const store = mapRevenueCatStore(eventData.store)

    yield* Effect.log('[Webhook] Parsed event:', {
      type: eventData.type,
      userId,
      productId,
      store: eventData.store,
      periodType: eventData.period_type,
    })

    const status = mapEventToStatus(eventData.type, eventData.period_type)

    // Calculate dates from milliseconds using Effect DateTime
    const purchasedAt = DateTime.toDateUtc(
      DateTime.unsafeMake(eventData.purchased_at_ms)
    )
    const expiresAt = eventData.expiration_at_ms
      ? DateTime.toDateUtc(DateTime.unsafeMake(eventData.expiration_at_ms))
      : DateTime.toDateUtc(
          DateTime.addDuration(DateTime.unsafeNow(), Duration.days(30))
        )

    // Build shared context for handlers
    const ctx: WebhookEventContext = {
      userId,
      productId,
      store,
      status,
      purchasedAt,
      expiresAt,
      eventData: {
        type: eventData.type,
        period_type: eventData.period_type,
        cancel_reason: eventData.cancel_reason,
        original_transaction_id: eventData.original_transaction_id,
        id: eventData.id,
        original_app_user_id: eventData.original_app_user_id,
        store: eventData.store,
      },
    }

    // Route to appropriate handler based on event type
    const handleEvent = pipe(
      Match.value(eventData.type),
      Match.when('TEST', () => Effect.void),
      Match.when('INITIAL_PURCHASE', () => handleInitialPurchase(ctx)),
      Match.when('RENEWAL', () => handleRenewal(ctx)),
      Match.when('CANCELLATION', () => handleCancellation(ctx)),
      Match.when('UNCANCELLATION', () => handleUncancellation(ctx)),
      Match.when('EXPIRATION', () => handleExpiration(ctx)),
      Match.when('BILLING_ISSUE', () => handleBillingIssue(ctx)),
      Match.when('PRODUCT_CHANGE', () => handleProductChange(ctx)),
      Match.orElse(() => Effect.void)
    )

    yield* handleEvent
  }).pipe(Effect.withSpan('SubscriptionService.handleRevenueCatWebhookEvent'))
