import { lockStoreSync } from '@lily/api/kernel/locks'
import { transactQuietly } from '@lily/api/kernel/transact'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import {
  decideStoreSync,
  deriveStoreState,
  type StoreSubscriptionState,
  toSubscriptionWrite,
} from '@lily/api/services/subscriptions/endpoints/webhook/store-state'
import { RevenueCatProvider } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import { PaymentProviderError } from '@lily/shared'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type StoreSyncOutcome =
  | 'no_store_subscription'
  | 'kept_gift'
  | 'unchanged'
  | 'applied'

// The fetch runs inside a transaction. It must answer before the session's
// `idle_in_transaction_session_timeout` ends that transaction, and before the
// `statement_timeout` of a sync that waits behind it (`pgPoolConfig`).
const STORE_FETCH_TIMEOUT = Duration.seconds(10)

const fetchStoreState = (
  userId: string
): Effect.Effect<
  Option.Option<StoreSubscriptionState>,
  PaymentProviderError,
  RevenueCatProvider
> =>
  Effect.gen(function* () {
    const provider = yield* RevenueCatProvider
    const info = yield* provider.getSubscriberInfo(userId).pipe(
      Effect.timeoutOrElse({
        duration: STORE_FETCH_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new PaymentProviderError({
              message: 'RevenueCat subscriber fetch timed out',
              code: 'revenuecat_timeout',
            })
          ),
      })
    )
    return deriveStoreState(info, provider.environment, DateTime.nowUnsafe())
  })

/**
 * Writes the store's current state over the user's row. Running it again
 * with the same state changes nothing, so a redelivered, reordered or nightly
 * repeated call converges on the same row.
 */
const applyStoreState = (params: {
  readonly userId: string
  readonly state: Option.Option<StoreSubscriptionState>
  readonly externalSubscriptionId: Option.Option<string>
  readonly source: string
}): Effect.Effect<StoreSyncOutcome, SqlError, SubscriptionRepository> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    if (Option.isNone(params.state)) return 'no_store_subscription' as const
    const state = params.state.value

    const existing = yield* subRepo.findByUserId(params.userId)
    const write = toSubscriptionWrite(
      params.userId,
      state,
      pipe(
        params.externalSubscriptionId,
        Option.orElse(() =>
          Option.fromNullishOr(existing?.externalSubscriptionId)
        ),
        Option.getOrNull
      )
    )
    const decision = decideStoreSync(existing, write, DateTime.nowUnsafe())

    return yield* pipe(
      Match.value(decision),
      Match.when({ _tag: 'KeepGift' }, () =>
        Effect.succeed('kept_gift' as const)
      ),
      Match.when({ _tag: 'Unchanged' }, () =>
        Effect.succeed('unchanged' as const)
      ),
      Match.when({ _tag: 'Write' }, ({ eventType }) =>
        Effect.gen(function* () {
          yield* subRepo.create(write)
          yield* subRepo.logEvent(params.userId, eventType, {
            tier: 'paid',
            status: state.status,
            productId: state.productId,
            store: state.store,
            source: params.source,
          })
          return 'applied' as const
        })
      ),
      Match.exhaustive
    )
  }).pipe(
    Effect.withSpan('SubscriptionService.applyStoreState', {
      attributes: { 'user.id': params.userId, 'sync.source': params.source },
    })
  )

/**
 * Fetches the user's current store state and writes it, as one step per
 * user. A sync that starts while another runs for the same user fetches
 * after that one has committed, so the state fetched last is written last.
 */
export const syncStoreState = (params: {
  readonly userId: string
  // The webhook's original transaction id; a reconciliation keeps the row's.
  readonly externalSubscriptionId: Option.Option<string>
  readonly source: string
}): Effect.Effect<
  StoreSyncOutcome,
  PaymentProviderError | SqlError,
  RevenueCatProvider | SubscriptionRepository | SqlClient.SqlClient
> =>
  transactQuietly(
    Effect.gen(function* () {
      yield* lockStoreSync(params.userId)
      const state = yield* fetchStoreState(params.userId)
      return yield* applyStoreState({ ...params, state })
    })
  )
