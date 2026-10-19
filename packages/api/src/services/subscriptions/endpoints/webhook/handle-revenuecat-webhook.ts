import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import {
  applyStoreState,
  fetchStoreState,
} from '@lily/api/services/subscriptions/endpoints/webhook/sync-store-state'
import { RevenueCatProvider } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import type { PaymentProviderError } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * A webhook event is only a signal that something changed. The subscriber's
 * current state is fetched from RevenueCat and written whole, so a late,
 * repeated or reordered event cannot roll the row back. A failed fetch fails
 * the request, and RevenueCat retries it.
 */
export const handleRevenueCatWebhook = (
  payload: string,
  authorization: string | undefined
): Effect.Effect<
  void,
  PaymentProviderError | SqlError,
  RevenueCatProvider | SubscriptionRepository
> =>
  Effect.gen(function* () {
    const provider = yield* RevenueCatProvider
    const subRepo = yield* SubscriptionRepository

    const { event } = yield* provider.constructWebhookEvent(
      payload,
      authorization
    )

    yield* Effect.log('[Webhook] Parsed event:', {
      id: event.id,
      type: event.type,
      userId: event.app_user_id,
      environment: event.environment,
    })

    if (event.type === 'TEST') return

    if (event.environment !== provider.environment) {
      yield* Effect.log('[Webhook] Ignored event from another environment', {
        id: event.id,
        environment: event.environment,
        expected: provider.environment,
      })
      return
    }

    const state = yield* fetchStoreState(event.app_user_id)

    // Applied before the event is recorded: applying the fetched state is
    // idempotent, so a crash between the two only means a redelivery applies
    // it again. Recording first would make that redelivery a silent no-op.
    const outcome = yield* applyStoreState({
      userId: event.app_user_id,
      state,
      externalSubscriptionId: pipe(
        Option.fromNullishOr(event.original_transaction_id),
        Option.orElse(() => Option.some(event.id))
      ),
      source: `webhook:${event.type}`,
    })

    const firstDelivery = yield* subRepo.claimWebhookEvent({
      id: event.id,
      eventType: event.type,
      appUserId: event.app_user_id,
      environment: event.environment,
    })

    yield* Effect.log('[Webhook] Applied event', {
      id: event.id,
      outcome,
      redelivered: !firstDelivery,
    })
  }).pipe(Effect.withSpan('SubscriptionService.handleRevenueCatWebhookEvent'))
