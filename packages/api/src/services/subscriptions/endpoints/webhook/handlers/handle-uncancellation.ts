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
    }
  })
