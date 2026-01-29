import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { RevenueCatProvider } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import {
  type PaymentProviderError,
  type Subscription,
  type SubscriptionStatus,
  type SubscriptionTier,
  type TierConfig,
} from '@lily/shared'
import { Context, Effect, Layer, Match, Option, pipe } from 'effect'

export interface SubscriptionInfoResult {
  subscription: Subscription | null
  usage: {
    aiChatsCount: number
    cardScansCount: number
    plantIdentifiesCount: number
  } | null
  tierConfig: TierConfig
}

export interface ISubscriptionService {
  readonly getCurrentSubscription: (
    userId: string
  ) => Effect.Effect<SubscriptionInfoResult, SqlError>

  readonly handleRevenueCatWebhookEvent: (
    payload: string,
    authorization: string | undefined
  ) => Effect.Effect<void, PaymentProviderError | SqlError>

  readonly getAllTiers: () => Effect.Effect<TierConfig[], SqlError>
}

export class SubscriptionService extends Context.Tag('SubscriptionService')<
  SubscriptionService,
  ISubscriptionService
>() {}

// Helper to map RevenueCat store to our store type
const mapRevenueCatStore = (
  store: string
): 'APP_STORE' | 'PLAY_STORE' | null => {
  return pipe(
    Match.value(store),
    Match.when('APP_STORE', () => 'APP_STORE' as const),
    Match.when('PLAY_STORE', () => 'PLAY_STORE' as const),
    Match.orElse(() => null)
  )
}

// Helper to map RevenueCat event type to subscription status
const mapEventToStatus = (
  eventType: string,
  periodType: string | null | undefined
): SubscriptionStatus => {
  return pipe(
    Match.value(eventType),
    Match.when('INITIAL_PURCHASE', () =>
      periodType === 'TRIAL' ? ('trialing' as const) : ('active' as const)
    ),
    Match.when('RENEWAL', () => 'active' as const),
    Match.when('CANCELLATION', () => 'canceled' as const),
    Match.when('UNCANCELLATION', () => 'active' as const),
    Match.when('EXPIRATION', () => 'expired' as const),
    Match.when('BILLING_ISSUE', () => 'past_due' as const),
    Match.when('PRODUCT_CHANGE', () => 'active' as const),
    Match.orElse(() => 'active' as const)
  )
}

export const SubscriptionServiceLive = Layer.effect(
  SubscriptionService,
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const revenueCatProvider = yield* RevenueCatProvider

    return {
      getCurrentSubscription: (userId: string) =>
        Effect.gen(function* () {
          const subscription = yield* subRepo.findByUserId(userId)
          const usage = yield* subRepo.getCurrentUsage(userId)

          // Get tier config based on effective tier
          const effectiveTier: SubscriptionTier =
            subscription &&
            (subscription.status === 'active' ||
              subscription.status === 'trialing')
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
        }),

      handleRevenueCatWebhookEvent: (
        payload: string,
        authorization: string | undefined
      ) =>
        Effect.gen(function* () {
          // Validate and parse the webhook event
          const event = yield* revenueCatProvider.constructWebhookEvent(
            payload,
            authorization
          )

          const eventData = event.event
          const userId = eventData.app_user_id
          const productId = eventData.product_id
          const store = mapRevenueCatStore(eventData.store)

          yield* Effect.log('[Webhook] Parsed event:', {
            type: eventData.type,
            userId,
            productId,
            store: eventData.store,
            periodType: eventData.period_type,
          })

          const status = mapEventToStatus(eventData.type, eventData.period_type)

          // Calculate dates from milliseconds
          const purchasedAt = new Date(eventData.purchased_at_ms)
          const expiresAt = eventData.expiration_at_ms
            ? new Date(eventData.expiration_at_ms)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default to 30 days

          // Handle different event types
          const handleEvent = pipe(
            Match.value(eventData.type),
            Match.when('TEST', () => Effect.void),
            Match.when('INITIAL_PURCHASE', () =>
              Effect.gen(function* () {
                // Determine if this is a trial
                const isTrialing = eventData.period_type === 'TRIAL'

                yield* subRepo.create({
                  userId,
                  tier: 'paid',
                  status,
                  trialStartsAt: isTrialing ? purchasedAt : null,
                  trialEndsAt: isTrialing ? expiresAt : null,
                  currentPeriodStart: purchasedAt,
                  currentPeriodEnd: expiresAt,
                  externalSubscriptionId:
                    eventData.original_transaction_id ?? eventData.id,
                  externalCustomerId: eventData.original_app_user_id,
                  provider: 'revenuecat',
                  productId,
                  store,
                })

                yield* subRepo.logEvent(userId, 'subscription_created', {
                  tier: 'paid',
                  status,
                  productId,
                  store: eventData.store,
                  isTrialing,
                })
              })
            ),
            Match.when('RENEWAL', () =>
              Effect.gen(function* () {
                const existingSub = yield* subRepo.findByUserId(userId)
                if (existingSub) {
                  yield* subRepo.updateByUserId(userId, {
                    status: 'active',
                    currentPeriodStart: purchasedAt,
                    currentPeriodEnd: expiresAt,
                    // Clear trial dates on renewal
                    trialStartsAt: null,
                    trialEndsAt: null,
                  })
                  yield* subRepo.logEvent(userId, 'subscription_updated', {
                    status: 'active',
                    eventType: 'RENEWAL',
                  })
                }
              })
            ),
            Match.when('CANCELLATION', () =>
              Effect.gen(function* () {
                const existingSub = yield* subRepo.findByUserId(userId)
                if (existingSub) {
                  yield* subRepo.cancel(userId)
                  yield* subRepo.logEvent(userId, 'subscription_canceled', {
                    reason: eventData.cancel_reason,
                  })
                }
              })
            ),
            Match.when('UNCANCELLATION', () =>
              Effect.gen(function* () {
                const existingSub = yield* subRepo.findByUserId(userId)
                if (existingSub) {
                  yield* subRepo.updateByUserId(userId, {
                    status: 'active',
                  })
                  yield* subRepo.logEvent(userId, 'subscription_updated', {
                    status: 'active',
                    eventType: 'UNCANCELLATION',
                  })
                }
              })
            ),
            Match.when('EXPIRATION', () =>
              Effect.gen(function* () {
                const existingSub = yield* subRepo.findByUserId(userId)
                if (existingSub) {
                  yield* subRepo.updateStatus(userId, 'expired')
                  yield* subRepo.logEvent(userId, 'subscription_updated', {
                    status: 'expired',
                    eventType: 'EXPIRATION',
                  })
                }
              })
            ),
            Match.when('BILLING_ISSUE', () =>
              Effect.gen(function* () {
                const existingSub = yield* subRepo.findByUserId(userId)
                if (existingSub) {
                  yield* subRepo.updateStatus(userId, 'past_due')
                  yield* subRepo.logEvent(userId, 'payment_failed', {
                    eventType: 'BILLING_ISSUE',
                  })
                }
              })
            ),
            Match.when('PRODUCT_CHANGE', () =>
              Effect.gen(function* () {
                const existingSub = yield* subRepo.findByUserId(userId)
                if (existingSub) {
                  yield* subRepo.updateByUserId(userId, {
                    productId,
                    currentPeriodStart: purchasedAt,
                    currentPeriodEnd: expiresAt,
                  })
                  yield* subRepo.logEvent(userId, 'subscription_updated', {
                    status: 'active',
                    eventType: 'PRODUCT_CHANGE',
                    newProductId: productId,
                  })
                }
              })
            ),
            Match.orElse(() => Effect.void)
          )

          yield* handleEvent
        }),

      getAllTiers: () => subRepo.getAllTiers(),
    }
  })
)
