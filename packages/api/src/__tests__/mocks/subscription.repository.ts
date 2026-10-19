import type {
  CreateSubscriptionData,
  ISubscriptionRepository,
  RevenueCatWebhookEventRecord,
} from '@lily/api/repositories/subscription.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { subscriptionUsage, userSubscriptions } from '@lily/db/schema'
import type {
  SubscriptionEventType,
  SubscriptionTier,
  TierConfig,
} from '@lily/shared'
import { Effect, Layer, Option, pipe } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'

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
  onLogEvent?: (
    userId: string,
    eventType: SubscriptionEventType,
    metadata?: object
  ) => void
  // Shared across layers to model the unique event-id table.
  claimedWebhookEventIds?: Set<string>
  // The first `create` calls fail with a SqlError, then writes succeed.
  failingCreates?: number | undefined
}

const rowFromCreate = (
  previous: typeof userSubscriptions.$inferSelect | null,
  data: CreateSubscriptionData
): typeof userSubscriptions.$inferSelect => ({
  id: previous?.id ?? 'sub-1',
  createdAt: previous?.createdAt ?? new Date('2024-01-01'),
  updatedAt: new Date(),
  userId: data.userId,
  tier: data.tier,
  status: data.status,
  trialStartsAt: Option.getOrNull(Option.fromNullishOr(data.trialStartsAt)),
  trialEndsAt: Option.getOrNull(Option.fromNullishOr(data.trialEndsAt)),
  currentPeriodStart: data.currentPeriodStart,
  currentPeriodEnd: data.currentPeriodEnd,
  canceledAt: pipe(
    Option.fromNullishOr(data.canceledAt),
    Option.orElse(() => Option.fromNullishOr(previous?.canceledAt)),
    Option.getOrNull
  ),
  externalSubscriptionId: Option.getOrNull(
    Option.fromNullishOr(data.externalSubscriptionId)
  ),
  externalCustomerId: Option.getOrNull(
    Option.fromNullishOr(data.externalCustomerId)
  ),
  provider: 'revenuecat',
  productId: Option.getOrNull(Option.fromNullishOr(data.productId)),
  store: Option.getOrNull(Option.fromNullishOr(data.store)),
})

export const createMockSubscriptionRepository = (
  options: MockSubscriptionOptions = {}
): Layer.Layer<SubscriptionRepository> => {
  // Upserts replace the held row, so a sequence of calls reads its own writes.
  let subscription = pipe(
    Option.fromNullishOr(options.subscription),
    Option.getOrNull
  )
  const usage = pipe(Option.fromNullishOr(options.usage), Option.getOrNull)
  const tier = pipe(
    Option.fromNullishOr(options.tier),
    Option.getOrElse(() => 'free' as SubscriptionTier)
  )
  const claimedWebhookEventIds =
    options.claimedWebhookEventIds ?? new Set<string>()
  let failingCreates = Option.getOrElse(
    Option.fromNullishOr(options.failingCreates),
    () => 0
  )

  const tierConfig = tier === 'paid' ? paidTierConfig : freeTierConfig

  const repo: ISubscriptionRepository = {
    findByUserId: () => Effect.succeed(subscription),
    findByUserIds: () => Effect.succeed(subscription ? [subscription] : []),
    findStoreSubscriptions: () =>
      Effect.succeed(
        subscription && subscription.externalSubscriptionId !== null
          ? [subscription]
          : []
      ),
    claimWebhookEvent: (event: RevenueCatWebhookEventRecord) =>
      Effect.sync(() => {
        if (claimedWebhookEventIds.has(event.id)) return false
        claimedWebhookEventIds.add(event.id)
        return true
      }),
    findByExternalId: () => Effect.succeed(subscription),
    create: (data) => {
      if (failingCreates > 0) {
        failingCreates--
        return Effect.fail(
          new SqlError({
            reason: new UnknownError({
              cause: new Error('connection lost'),
              message: 'connection lost',
            }),
          })
        )
      }
      if (options.onCreate) {
        options.onCreate(data)
      }
      subscription = rowFromCreate(subscription, data)
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
          Option.fromNullishOr(usage),
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
          Option.fromNullishOr(usage),
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
    logEvent: (userId, eventType, metadata) =>
      Effect.sync(() => {
        if (options.onLogEvent) {
          options.onLogEvent(userId, eventType, metadata)
        }
      }),
  }

  return Layer.succeed(SubscriptionRepository, repo)
}
