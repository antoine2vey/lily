import type {
  CreateSubscriptionData,
  ISubscriptionRepository,
} from '@lily/api/repositories/subscription.repository'
import {
  ReservationId,
  SubscriptionRepository,
} from '@lily/api/repositories/subscription.repository'
import type { subscriptionUsage, userSubscriptions } from '@lily/db/schema'
import type {
  SubscriptionEventType,
  SubscriptionTier,
  TierConfig,
  UsageField,
} from '@lily/shared'
import { Array, Effect, Layer, Option, pipe, Result } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'

const freeTierConfig: TierConfig = {
  tier: 'free',
  name: 'Free',
  priceMonthly: 0,
  maxPlants: 5,
  maxAiChatsMonthly: 10,
  maxCardScansMonthly: 5,
  maxPlantIdentifiesMonthly: 3,
}

const connectionLost = () =>
  new SqlError({
    reason: new UnknownError({
      cause: new Error('connection lost'),
      message: 'connection lost',
    }),
  })

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
  // The first `create` calls fail with a SqlError, then writes succeed.
  failingCreates?: number | undefined
  onReserveUsage?: (userId: string, field: UsageField) => void
  onReleaseUsage?: (reservationId: ReservationId, field: UsageField) => void
  onChargeUsage?: (reservationId: ReservationId, field: UsageField) => void
  // `releaseUsage` and `chargeUsage` fail with a SqlError.
  settlingFails?: boolean | undefined
  subscriptionsByUser?: Record<string, typeof userSubscriptions.$inferSelect>
  // The rows of `subscription_tiers`. A tier with no row reads as the free
  // default, as in the real repository.
  tierRows?: ReadonlyArray<TierConfig>
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
  let failingCreates = Option.getOrElse(
    Option.fromNullishOr(options.failingCreates),
    () => 0
  )

  const tierConfig = tier === 'paid' ? paidTierConfig : freeTierConfig
  const byUser = options.subscriptionsByUser

  const reserved = new Map<ReservationId, UsageField>()
  let taken = 0
  const leaveReserved = (
    reservationId: ReservationId,
    onLeft: MockSubscriptionOptions['onReleaseUsage']
  ) =>
    Effect.suspend(() => {
      if (options.settlingFails) return Effect.fail(connectionLost())
      const field = Option.fromNullishOr(reserved.get(reservationId))
      reserved.delete(reservationId)
      return Effect.succeed(
        Option.match(field, {
          onNone: () => false,
          onSome: (left) => {
            onLeft?.(reservationId, left)
            return true
          },
        })
      )
    })

  const repo: ISubscriptionRepository = {
    findByUserId: (userId) =>
      Effect.succeed(
        byUser === undefined
          ? subscription
          : pipe(Option.fromNullishOr(byUser[userId]), Option.getOrNull)
      ),
    findByUserIds: (userIds) =>
      Effect.succeed(
        byUser === undefined
          ? subscription
            ? [subscription]
            : []
          : Array.filterMap(userIds, (id) =>
              Result.fromOption(Option.fromNullishOr(byUser[id]), () => id)
            )
      ),
    findStoreSubscriptions: Effect.sync(() =>
      subscription && subscription.externalSubscriptionId !== null
        ? [subscription]
        : []
    ),
    holdAccount: () => Effect.succeed(true),
    claimWebhookEvent: () => Effect.succeed('recorded'),
    deleteWebhookEvents: () => Effect.void,
    create: (data) => {
      if (failingCreates > 0) {
        failingCreates--
        return Effect.fail(connectionLost())
      }
      if (options.onCreate) {
        options.onCreate(data)
      }
      subscription = rowFromCreate(subscription, data)
      return Effect.succeed(subscription)
    },
    updateByUserId: (userId, data) => {
      if (options.onUpdateByUserId) {
        options.onUpdateByUserId(userId, data)
      }
      return Effect.succeed(subscription)
    },
    getTier: (name) =>
      Effect.succeed(
        pipe(
          Option.fromNullishOr(options.tierRows),
          Option.map((rows) =>
            pipe(
              Array.findFirst(rows, (row) => row.tier === name),
              Option.getOrElse(() => freeTierConfig)
            )
          ),
          Option.getOrElse(() =>
            byUser === undefined
              ? tierConfig
              : name === 'paid'
                ? paidTierConfig
                : freeTierConfig
          )
        )
      ),
    getAllTiers: Effect.succeed(
      pipe(
        Option.fromNullishOr(options.tierRows),
        Option.map((rows) => [...rows]),
        Option.getOrElse(() => [freeTierConfig, paidTierConfig])
      )
    ),
    getCurrentUsage: () => Effect.succeed(usage),
    reserveUsage: (userId, field, limit) => {
      const countKey = `${field}Count` as const
      const current = pipe(
        Option.fromNullishOr(usage),
        Option.map((u) => u[countKey]),
        Option.getOrElse(() => 0)
      )
      if (limit !== null && current >= limit) return Effect.succeed(null)
      options.onReserveUsage?.(userId, field)
      taken += 1
      const reservationId = ReservationId.make(`reservation-${taken}`)
      reserved.set(reservationId, field)
      return Effect.succeed({
        reservationId,
        usage: {
          id: 'usage-1',
          userId,
          periodStart: new Date(),
          periodEnd: new Date(),
          aiChatsCount: 0,
          cardScansCount: 0,
          plantIdentifiesCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...usage,
          [countKey]: current + 1,
        },
      })
    },
    releaseUsage: (reservationId) =>
      leaveReserved(reservationId, options.onReleaseUsage),
    chargeUsage: (reservationId) =>
      leaveReserved(reservationId, options.onChargeUsage),
    findReservedBefore: () => Effect.succeed([]),
    deleteSettledReservations: () => Effect.succeed(0),
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
