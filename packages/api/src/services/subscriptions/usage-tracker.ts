import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { SubscriptionUsage } from '@lily/shared'
import { Context, Effect, Layer } from 'effect'

export interface IUsageTracker {
  readonly trackAiChat: (
    userId: string
  ) => Effect.Effect<SubscriptionUsage | null, SqlError>

  readonly trackCardScan: (
    userId: string
  ) => Effect.Effect<SubscriptionUsage | null, SqlError>

  readonly trackPlantIdentify: (
    userId: string
  ) => Effect.Effect<SubscriptionUsage | null, SqlError>
}

export class UsageTracker extends Context.Tag('UsageTracker')<
  UsageTracker,
  IUsageTracker
>() {}

export const UsageTrackerLive = Layer.effect(
  UsageTracker,
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository

    return {
      trackAiChat: (userId: string) =>
        subRepo.incrementUsage(userId, 'aiChats'),

      trackCardScan: (userId: string) =>
        subRepo.incrementUsage(userId, 'cardScans'),

      trackPlantIdentify: (userId: string) =>
        subRepo.incrementUsage(userId, 'plantIdentifies'),
    }
  })
)
