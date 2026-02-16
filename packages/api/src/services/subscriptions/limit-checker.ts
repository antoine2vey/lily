import type { SqlError } from '@effect/sql/SqlError'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import { LimitExceededError } from '@lily/shared'
import { Config, Context, Effect, Layer, Option, pipe } from 'effect'

export interface ILimitChecker {
  readonly checkPlantLimit: (
    userId: string
  ) => Effect.Effect<void, LimitExceededError | SqlError>

  readonly checkAiChatLimit: (
    userId: string
  ) => Effect.Effect<void, LimitExceededError | SqlError>

  readonly checkCardScanLimit: (
    userId: string
  ) => Effect.Effect<void, LimitExceededError | SqlError>

  readonly checkPlantIdentifyLimit: (
    userId: string
  ) => Effect.Effect<void, LimitExceededError | SqlError>

  readonly checkDelegationAccess: (
    userId: string
  ) => Effect.Effect<void, LimitExceededError | SqlError>
}

export class LimitChecker extends Context.Tag('LimitChecker')<
  LimitChecker,
  ILimitChecker
>() {}

const noopLimitChecker: ILimitChecker = {
  checkPlantLimit: () => Effect.void,
  checkAiChatLimit: () => Effect.void,
  checkCardScanLimit: () => Effect.void,
  checkPlantIdentifyLimit: () => Effect.void,
  checkDelegationAccess: () => Effect.void,
}

const DisableLimitsConfig = Config.boolean('DISABLE_LIMITS').pipe(
  Config.withDefault(false)
)

export const LimitCheckerLive = Layer.effect(
  LimitChecker,
  Effect.gen(function* () {
    const disableLimits = yield* DisableLimitsConfig

    if (disableLimits) {
      yield* Effect.log('LimitChecker is disabled')
      return noopLimitChecker
    }

    const subRepo = yield* SubscriptionRepository
    const achievementRepo = yield* AchievementRepository

    // Helper to check if user has active paid subscription
    const getUserTierAndLimits = (userId: string) =>
      Effect.gen(function* () {
        const subscription = yield* subRepo.findByUserId(userId)

        // Determine effective tier based on subscription status and billing period
        const effectiveTier = pipe(
          Option.fromNullable(subscription),
          Option.filter(hasPremiumAccess),
          Option.map((sub) => sub.tier),
          Option.getOrElse(() => 'free' as const)
        )

        const tierConfig = yield* subRepo.getTier(effectiveTier)
        return { subscription, tierConfig }
      })

    return {
      checkPlantLimit: (userId: string) =>
        Effect.gen(function* () {
          const { tierConfig } = yield* getUserTierAndLimits(userId)

          // null means unlimited
          if (tierConfig.maxPlants === null) {
            return
          }

          const currentCount = yield* achievementRepo.countPlants(userId)

          if (currentCount >= tierConfig.maxPlants) {
            return yield* Effect.fail(
              new LimitExceededError({
                feature: 'plants',
                limit: tierConfig.maxPlants,
                current: currentCount,
                message: `You've reached your limit of ${tierConfig.maxPlants} plants. Upgrade to Premium for unlimited plants!`,
              })
            )
          }
        }),

      checkAiChatLimit: (userId: string) =>
        Effect.gen(function* () {
          const { tierConfig } = yield* getUserTierAndLimits(userId)

          // null means unlimited
          if (tierConfig.maxAiChatsMonthly === null) {
            return
          }

          const usage = yield* subRepo.getCurrentUsage(userId)
          const currentCount = pipe(
            Option.fromNullable(usage),
            Option.flatMap((u) => Option.fromNullable(u.aiChatsCount)),
            Option.getOrElse(() => 0)
          )

          if (currentCount >= tierConfig.maxAiChatsMonthly) {
            return yield* Effect.fail(
              new LimitExceededError({
                feature: 'ai_chats',
                limit: tierConfig.maxAiChatsMonthly,
                current: currentCount,
                message: `You've used all ${tierConfig.maxAiChatsMonthly} AI chats this month. Upgrade to Premium for unlimited AI features!`,
              })
            )
          }
        }),

      checkCardScanLimit: (userId: string) =>
        Effect.gen(function* () {
          const { tierConfig } = yield* getUserTierAndLimits(userId)

          // null means unlimited
          if (tierConfig.maxCardScansMonthly === null) {
            return
          }

          const usage = yield* subRepo.getCurrentUsage(userId)
          const currentCount = pipe(
            Option.fromNullable(usage),
            Option.flatMap((u) => Option.fromNullable(u.cardScansCount)),
            Option.getOrElse(() => 0)
          )

          if (currentCount >= tierConfig.maxCardScansMonthly) {
            return yield* Effect.fail(
              new LimitExceededError({
                feature: 'card_scans',
                limit: tierConfig.maxCardScansMonthly,
                current: currentCount,
                message: `You've used all ${tierConfig.maxCardScansMonthly} card scans this month. Upgrade to Premium for unlimited scans!`,
              })
            )
          }
        }),

      checkPlantIdentifyLimit: (userId: string) =>
        Effect.gen(function* () {
          const { tierConfig } = yield* getUserTierAndLimits(userId)

          // null means unlimited
          if (tierConfig.maxPlantIdentifiesMonthly === null) {
            return
          }

          const usage = yield* subRepo.getCurrentUsage(userId)
          const currentCount = pipe(
            Option.fromNullable(usage),
            Option.flatMap((u) => Option.fromNullable(u.plantIdentifiesCount)),
            Option.getOrElse(() => 0)
          )

          if (currentCount >= tierConfig.maxPlantIdentifiesMonthly) {
            return yield* Effect.fail(
              new LimitExceededError({
                feature: 'plant_identifies',
                limit: tierConfig.maxPlantIdentifiesMonthly,
                current: currentCount,
                message: `You've used all ${tierConfig.maxPlantIdentifiesMonthly} plant identifications this month. Upgrade to Premium for unlimited AI features!`,
              })
            )
          }
        }),

      checkDelegationAccess: (userId: string) =>
        Effect.gen(function* () {
          const { tierConfig } = yield* getUserTierAndLimits(userId)

          if (tierConfig.tier === 'free') {
            return yield* Effect.fail(
              new LimitExceededError({
                feature: 'care_delegation',
                limit: 0,
                current: 0,
                message:
                  'Care delegation is a premium feature. Upgrade to create delegations.',
              })
            )
          }
        }).pipe(Effect.withSpan('LimitChecker.checkDelegationAccess')),
    }
  })
)
