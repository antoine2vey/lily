import type { SqlError } from '@effect/sql/SqlError'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { LimitExceededError } from '@lily/shared'
import { Context, Effect, Layer, Option, pipe } from 'effect'

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
}

export class LimitChecker extends Context.Tag('LimitChecker')<
  LimitChecker,
  ILimitChecker
>() {}

export const LimitCheckerLive = Layer.effect(
  LimitChecker,
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const achievementRepo = yield* AchievementRepository

    // Helper to check if user has active paid subscription
    const getUserTierAndLimits = (userId: string) =>
      Effect.gen(function* () {
        const subscription = yield* subRepo.findByUserId(userId)

        // Default to free tier if no subscription exists
        const effectiveTier =
          subscription &&
          (subscription.status === 'active' ||
            subscription.status === 'trialing')
            ? subscription.tier
            : 'free'

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
    }
  })
)
