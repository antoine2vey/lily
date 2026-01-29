import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { WebhookEventContext } from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { Effect } from 'effect'

export const handleInitialPurchase = (
  ctx: WebhookEventContext
): Effect.Effect<void, SqlError, SubscriptionRepository> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository

    // Determine if this is a trial
    const isTrialing = ctx.eventData.period_type === 'TRIAL'

    yield* subRepo.create({
      userId: ctx.userId,
      tier: 'paid',
      status: ctx.status,
      trialStartsAt: isTrialing ? ctx.purchasedAt : null,
      trialEndsAt: isTrialing ? ctx.expiresAt : null,
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
      status: ctx.status,
      productId: ctx.productId,
      store: ctx.eventData.store,
      isTrialing,
    })
  })
