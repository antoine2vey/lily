import type {
  CreateSubscriptionData,
  ISubscriptionRepository,
} from '@lily/api/repositories/subscription.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { subscriptionUsage, userSubscriptions } from '@lily/db/schema'
import type { SubscriptionTier, TierConfig } from '@lily/shared'
import { Effect, Layer, Option, pipe } from 'effect'

// Default free tier config
const freeTierConfig: TierConfig = {
  tier: 'free',
  name: 'Free',
  priceMonthly: 0,
  maxPlants: 5,
  maxAiChatsMonthly: 10,
  maxCardScansMonthly: 5,
  maxPlantIdentifiesMonthly: 3,
}

// Paid tier config (unlimited = null)
const paidTierConfig: TierConfig = {
  tier: 'paid',
  name: 'Premium',
  priceMonthly: 299,
  maxPlants: null,
  maxAiChatsMonthly: null,
  maxCardScansMonthly: null,
  maxPlantIdentifiesMonthly: null,
}

interface MockSubscriptionOptions {
  subscription?: typeof userSubscriptions.$inferSelect | null | undefined
  usage?: typeof subscriptionUsage.$inferSelect | null | undefined
  tier?: SubscriptionTier | undefined
  onCreate?: (data: CreateSubscriptionData) => void
  onUpdateByUserId?: (
    userId: string,
    data: Partial<CreateSubscriptionData>
  ) => void
}

export const createMockSubscriptionRepository = (
  options: MockSubscriptionOptions = {}
): Layer.Layer<SubscriptionRepository> => {
  const subscription = pipe(
    Option.fromNullable(options.subscription),
    Option.getOrNull
  )
  const usage = pipe(Option.fromNullable(options.usage), Option.getOrNull)
  const tier = pipe(
    Option.fromNullable(options.tier),
    Option.getOrElse(() => 'free' as SubscriptionTier)
  )

  const tierConfig = tier === 'paid' ? paidTierConfig : freeTierConfig

  const repo: ISubscriptionRepository = {
    findByUserId: () => Effect.succeed(subscription),
    findByUserIds: () => Effect.succeed(subscription ? [subscription] : []),
    findByExternalId: () => Effect.succeed(subscription),
    create: (data) => {
      if (options.onCreate) {
        options.onCreate(data)
      }
      return Effect.succeed(subscription)
    },
    updateStatus: () => Effect.succeed(subscription),
    updateFromWebhook: () => Effect.succeed(subscription),
    updateByUserId: (userId, data) => {
      if (options.onUpdateByUserId) {
        options.onUpdateByUserId(userId, data)
      }
      return Effect.succeed(subscription)
    },
    cancel: () => Effect.succeed(subscription),
    getTier: () => Effect.succeed(tierConfig),
    getAllTiers: () => Effect.succeed([freeTierConfig, paidTierConfig]),
    getCurrentUsage: () => Effect.succeed(usage),
    getOrCreateUsage: () =>
      Effect.succeed(
        pipe(
          Option.fromNullable(usage),
          Option.getOrElse(() => ({
            id: 'usage-1',
            userId: 'user-1',
            periodStart: new Date(),
            periodEnd: new Date(),
            aiChatsCount: 0,
            cardScansCount: 0,
            plantIdentifiesCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        )
      ),
    incrementUsage: () =>
      Effect.succeed(
        pipe(
          Option.fromNullable(usage),
          Option.getOrElse(() => ({
            id: 'usage-1',
            userId: 'user-1',
            periodStart: new Date(),
            periodEnd: new Date(),
            aiChatsCount: 1,
            cardScansCount: 0,
            plantIdentifiesCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        )
      ),
    findGiftEvents: () => Effect.succeed({ items: [], total: 0 }),
    logEvent: () => Effect.void,
  }

  return Layer.succeed(SubscriptionRepository, repo)
}
