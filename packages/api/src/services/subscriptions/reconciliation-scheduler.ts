import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  applyStoreState,
  fetchStoreState,
} from '@lily/api/services/subscriptions/endpoints/webhook/sync-store-state'
import { Effect, Option } from 'effect'

// A missed webhook leaves a store-linked row stale until the next event.
// The nightly pass re-reads every store-linked user from RevenueCat through
// the same fetch-and-apply the webhook uses.
export const reconcileStoreSubscriptions = Effect.gen(function* () {
  const subRepo = yield* SubscriptionRepository
  const rows = yield* subRepo.findStoreSubscriptions()

  yield* Effect.forEach(
    rows,
    (row) =>
      Effect.gen(function* () {
        const state = yield* fetchStoreState(row.userId)
        const outcome = yield* applyStoreState({
          userId: row.userId,
          state,
          externalSubscriptionId: Option.none(),
          source: 'reconciliation',
        })
        if (outcome !== 'unchanged') {
          yield* Effect.log('[subscription-reconciliation] Row changed', {
            userId: row.userId,
            outcome,
          })
        }
      }).pipe(
        Effect.catchTag('PaymentProviderError', (error) =>
          Effect.logWarning('[subscription-reconciliation] Fetch failed', {
            userId: row.userId,
            code: error.code,
            message: error.message,
          })
        )
      ),
    { concurrency: 2, discard: true }
  )
}).pipe(Effect.withSpan('subscription-reconciliation.reconcile'))

export const startSubscriptionReconciliationScheduler = createScheduler({
  name: 'subscription-reconciliation',
  interval: '1 day',
  runOnStartup: false,
  task: reconcileStoreSubscriptions,
})
