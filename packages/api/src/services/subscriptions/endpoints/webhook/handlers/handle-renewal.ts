import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { WebhookEventContext } from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { Effect } from 'effect'

export const handleRenewal = (
  ctx: WebhookEventContext
): Effect.Effect<void, SqlError, SubscriptionRepository> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository

    const existingSub = yield* subRepo.findByUserId(ctx.userId)
    if (existingSub) {
      yield* subRepo.updateByUserId(ctx.userId, {
        status: 'active',
        currentPeriodStart: ctx.purchasedAt,
        currentPeriodEnd: ctx.expiresAt,
        // Clear trial dates on renewal
        trialStartsAt: null,
        trialEndsAt: null,
      })
      yield* subRepo.logEvent(ctx.userId, 'subscription_updated', {
        status: 'active',
        eventType: 'RENEWAL',
      })
    }
  })
