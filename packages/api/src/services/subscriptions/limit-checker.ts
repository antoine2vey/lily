import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { resolveTierConfig } from '@lily/api/services/subscriptions/effective-tier'
import {
  DisableLimitsConfig,
  NodeEnvConfig,
} from '@lily/api/services/subscriptions/limits-config'
import { LimitExceededError } from '@lily/shared'
import { Context, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface ILimitChecker {
  readonly checkPlantLimit: (
    userId: string
  ) => Effect.Effect<void, LimitExceededError | SqlError>

  readonly checkDelegationAccess: (
    userId: string
  ) => Effect.Effect<void, LimitExceededError | SqlError>
}

export class LimitChecker extends Context.Service<
  LimitChecker,
  ILimitChecker
>()('LimitChecker') {}

const noopLimitChecker: ILimitChecker = {
  checkPlantLimit: () => Effect.void,
  checkDelegationAccess: () => Effect.void,
}

export const LimitCheckerLive = Layer.effect(
  LimitChecker,
  Effect.gen(function* () {
    const disableLimits = yield* DisableLimitsConfig
    const nodeEnv = yield* NodeEnvConfig

    if (disableLimits) {
      // Prevent disabling limits in production
      if (nodeEnv === 'production') {
        yield* Effect.logWarning(
          'DISABLE_LIMITS=true is ignored in production environment'
        )
      } else {
        yield* Effect.logWarning(
          'LimitChecker is disabled (non-production environment)'
        )
        return noopLimitChecker
      }
    }

    const subRepo = yield* SubscriptionRepository
    const achievementRepo = yield* AchievementRepository

    const checkDelegationAccess = Effect.fn(
      'LimitChecker.checkDelegationAccess'
    )(function* (userId: string) {
      const tierConfig = yield* resolveTierConfig(subRepo, userId)

      if (tierConfig.tier === 'free') {
        return yield* new LimitExceededError({
          feature: 'care_delegation',
          limit: 0,
          current: 0,
          message:
            'Care delegation is a premium feature. Upgrade to create delegations.',
        })
      }
    })

    return {
      checkPlantLimit: (userId: string) =>
        Effect.gen(function* () {
          const tierConfig = yield* resolveTierConfig(subRepo, userId)

          // null means unlimited
          if (tierConfig.maxPlants === null) {
            return
          }

          // Dead plants free their slot; the cemetery is not capped.
          const currentCount = yield* achievementRepo.countLivingPlants(userId)

          if (currentCount >= tierConfig.maxPlants) {
            return yield* new LimitExceededError({
              feature: 'plants',
              limit: tierConfig.maxPlants,
              current: currentCount,
              message: `You've reached your limit of ${tierConfig.maxPlants} plants. Upgrade to Premium for unlimited plants!`,
            })
          }
        }),

      checkDelegationAccess,
    }
  })
)
