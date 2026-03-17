import type { SqlError } from '@effect/sql/SqlError'
import type { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import {
  ensureSubscriptionActive,
  type WebhookEventContext,
} from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import type { Effect } from 'effect'

export const handleRenewal = (
  ctx: WebhookEventContext
): Effect.Effect<void, SqlError, SubscriptionRepository> =>
  ensureSubscriptionActive(ctx, 'RENEWAL', {
    currentPeriodStart: ctx.purchasedAt,
    currentPeriodEnd: ctx.expiresAt,
    trialStartsAt: null,
    trialEndsAt: null,
  })
