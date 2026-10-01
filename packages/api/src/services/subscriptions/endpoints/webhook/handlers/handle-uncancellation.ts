import type { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import {
  ensureSubscriptionActive,
  type WebhookEventContext,
} from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import type { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const handleUncancellation = (
  ctx: WebhookEventContext
): Effect.Effect<void, SqlError, SubscriptionRepository> =>
  ensureSubscriptionActive(ctx, 'UNCANCELLATION')
