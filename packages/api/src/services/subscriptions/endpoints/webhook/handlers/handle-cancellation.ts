import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { WebhookEventContext } from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { Effect } from 'effect'

export const handleCancellation = (
  ctx: WebhookEventContext
): Effect.Effect<void, SqlError, SubscriptionRepository> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository

    const existingSub = yield* subRepo.findByUserId(ctx.userId)
    if (existingSub) {
      yield* subRepo.cancel(ctx.userId)
      yield* subRepo.logEvent(ctx.userId, 'subscription_canceled', {
        reason: ctx.eventData.cancel_reason,
      })
    }
  })
