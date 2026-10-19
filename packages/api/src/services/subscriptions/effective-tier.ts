import type { ISubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import type { TierConfig } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const resolveTierConfig = (
  subRepo: ISubscriptionRepository,
  userId: string
): Effect.Effect<TierConfig, SqlError> =>
  Effect.gen(function* () {
    const subscription = yield* subRepo.findByUserId(userId)
    const effectiveTier = pipe(
      Option.fromNullishOr(subscription),
      Option.filter(hasPremiumAccess),
      Option.map((sub) => sub.tier),
      Option.getOrElse(() => 'free' as const)
    )
    return yield* subRepo.getTier(effectiveTier)
  })
