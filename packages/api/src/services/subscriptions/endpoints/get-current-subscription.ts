import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type {
  SubscriptionInfo,
  SubscriptionStatus,
  SubscriptionTier,
} from '@lily/shared'
import { Effect, Option } from 'effect'

export const getCurrentSubscription = (
  userId: string
): Effect.Effect<SubscriptionInfo, SqlError, SubscriptionRepository> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository

    const subscription = yield* subRepo.findByUserId(userId)
    const usage = yield* subRepo.getCurrentUsage(userId)

    // Get tier config based on effective tier
    const effectiveTier: SubscriptionTier =
      subscription &&
      (subscription.status === 'active' || subscription.status === 'trialing')
        ? (subscription.tier as SubscriptionTier)
        : 'free'

    const tierConfig = yield* subRepo.getTier(effectiveTier)

    return {
      subscription: subscription
        ? {
            id: subscription.id,
            userId: subscription.userId,
            tier: subscription.tier as SubscriptionTier,
            status: subscription.status as SubscriptionStatus,
            trialStartsAt: Option.getOrNull(
              Option.fromNullable(subscription.trialStartsAt)
            ),
            trialEndsAt: Option.getOrNull(
              Option.fromNullable(subscription.trialEndsAt)
            ),
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            canceledAt: Option.getOrNull(
              Option.fromNullable(subscription.canceledAt)
            ),
            createdAt: subscription.createdAt,
            updatedAt: subscription.updatedAt,
          }
        : null,
      usage: usage
        ? {
            aiChatsCount: usage.aiChatsCount,
            cardScansCount: usage.cardScansCount,
            plantIdentifiesCount: usage.plantIdentifiesCount,
          }
        : null,
      tierConfig,
    }
  }).pipe(
    Effect.withSpan('SubscriptionService.getCurrentSubscription', {
      attributes: { 'user.id': userId },
    })
  )
