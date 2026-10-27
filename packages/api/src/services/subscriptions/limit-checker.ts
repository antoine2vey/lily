import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { canopyPlantCapFrom } from '@lily/api/services/subscriptions/canopy-plant-cap'
import { resolveTierConfig } from '@lily/api/services/subscriptions/effective-tier'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import {
  DisableLimitsConfig,
  NodeEnvConfig,
} from '@lily/api/services/subscriptions/limits-config'
import { LimitExceededError, type PlantOwner } from '@lily/shared'
import { Array, Context, Effect, Layer, Match, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface ILimitChecker {
  readonly checkPlantLimit: (
    owner: PlantOwner
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
    const canopyRepo = yield* CanopyRepository

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

    const canopyPlantCap = (canopyId: string) =>
      Effect.gen(function* () {
        const members = yield* canopyRepo.findMembersByJoinDate(canopyId)
        const subscriptions = yield* subRepo.findByUserIds(
          Array.map(members, (m) => m.userId)
        )
        const memberTiers = yield* Effect.forEach(
          pipe(
            subscriptions,
            Array.filter(hasPremiumAccess),
            Array.map((sub) => sub.tier),
            Array.dedupe
          ),
          subRepo.getTier
        )
        const free = yield* subRepo.getTier('free')
        return canopyPlantCapFrom(
          Array.map(memberTiers, (tier) => tier.maxPlants),
          free.maxPlants
        )
      })

    const checkPlantLimit = Effect.fn('LimitChecker.checkPlantLimit')(
      function* (owner: PlantOwner) {
        const maxPlants = yield* Match.value(owner).pipe(
          Match.tag('User', ({ userId }) =>
            Effect.map(
              resolveTierConfig(subRepo, userId),
              (tier) => tier.maxPlants
            )
          ),
          Match.tag('Canopy', ({ canopyId }) => canopyPlantCap(canopyId)),
          Match.exhaustive
        )

        // null means unlimited
        if (maxPlants === null) {
          return
        }

        // Dead plants free their slot; the cemetery is not capped.
        const currentCount = yield* achievementRepo.countLivingPlants(owner)

        if (currentCount >= maxPlants) {
          return yield* new LimitExceededError(
            owner._tag === 'User'
              ? {
                  feature: 'plants',
                  limit: maxPlants,
                  current: currentCount,
                  message: `You've reached your limit of ${maxPlants} plants. Upgrade to Premium for unlimited plants!`,
                }
              : {
                  feature: 'canopy_plants',
                  limit: maxPlants,
                  current: currentCount,
                  message: `This Canopy has reached its limit of ${maxPlants} plants. Any member going Premium lifts it.`,
                }
          )
        }
      }
    )

    return {
      checkPlantLimit,
      checkDelegationAccess,
    }
  })
)
