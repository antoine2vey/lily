import { Transaction } from '@lily/api/kernel/transact'
import { Effect } from 'effect'

export const assumingTransaction = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, Transaction>> =>
  Effect.provideService(effect, Transaction, Transaction.of({}))
