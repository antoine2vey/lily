import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { WebhookEventContext } from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { Effect } from 'effect'

export const handleUncancellation = (
  ctx: WebhookEventContext
): Effect.Effect<void, SqlError, SubscriptionRepository> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository

    const existingSub = yield* subRepo.findByUserId(ctx.userId)
    if (existingSub) {
      yield* subRepo.updateByUserId(ctx.userId, {
        status: 'active',
      })
      yield* subRepo.logEvent(ctx.userId, 'subscription_updated', {
        status: 'active',
        eventType: 'UNCANCELLATION',
      })
    } else {
      // No subscription existing but user uncancelled (paid after cancellation while subscription was valid)
      yield* subRepo.create({
        userId: ctx.userId,
        tier: 'paid',
        status: 'active',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: ctx.purchasedAt,
        currentPeriodEnd: ctx.expiresAt,
        externalSubscriptionId:
          ctx.eventData.original_transaction_id ?? ctx.eventData.id,
        externalCustomerId: ctx.eventData.original_app_user_id,
        provider: 'revenuecat',
        productId: ctx.productId,
        store: ctx.store,
      })

      yield* subRepo.logEvent(ctx.userId, 'subscription_created', {
        tier: 'paid',
        status: 'active',
        eventType: 'UNCANCELLATION',
        note: 'Created from UNCANCELLATION event (subscription was missing)',
      })
    }
  })
