import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { TierConfig } from '@lily/shared'
import { Effect } from 'effect'

export const getTiers = (): Effect.Effect<
  TierConfig[],
  SqlError,
  SubscriptionRepository
> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    return yield* subRepo.getAllTiers()
  })
