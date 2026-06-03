import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { isStorePayer } from '@lily/api/services/subscriptions/has-premium-access'
import { StorePayerProtectedError } from '@lily/shared/errors/admin'
import { Effect } from 'effect'

/**
 * Guards admin subscription mutations (gift / revoke) against overwriting a
 * real App Store / Play Store payer. Both operations upsert the userSubscriptions
 * row and would null out the RevenueCat link, so we refuse when the target is an
 * active store payer. Admin-gifted and free users pass through untouched.
 */
export const assertNotStorePayer = (
  userId: string
): Effect.Effect<
  void,
  SqlError | StorePayerProtectedError,
  SubscriptionRepository
> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const subscription = yield* subRepo.findByUserId(userId)
    if (isStorePayer(subscription)) {
      return yield* new StorePayerProtectedError()
    }
  })
