import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { RevenueCatProvider } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import {
  type AppStore,
  type PaymentProviderError,
  type Subscription,
  SubscriptionNotFoundError,
  type SubscriptionStatus,
  type SubscriptionTier,
  type TierConfig,
} from '@lily/shared'
import { Console, Context, Effect, Layer, Match, Option, pipe } from 'effect'

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

  readonly cancelSubscription: (
    userId: string
  ) => Effect.Effect<void, SubscriptionNotFoundError | SqlError>

  readonly handleRevenueCatWebhookEvent: (
    payload: string,
    authorization: string | undefined
  ) => Effect.Effect<void, PaymentProviderError | SqlError>

  readonly syncSubscription: (
    userId: string
  ) => Effect.Effect<SubscriptionInfoResult, PaymentProviderError | SqlError>

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
          yield* Effect.log(
            '[getCurrentSubscription] Starting for userId:',
            userId
          )

          yield* Effect.log('[getCurrentSubscription] Fetching subscription...')
          const subscription = yield* subRepo.findByUserId(userId)
          yield* Effect.log(
            '[getCurrentSubscription] Subscription result:',
            subscription
          )

          yield* Effect.log('[getCurrentSubscription] Fetching usage...')
          const usage = yield* subRepo.getCurrentUsage(userId)
          yield* Effect.log('[getCurrentSubscription] Usage result:', usage)

          // Get tier config based on effective tier
          const effectiveTier: SubscriptionTier =
            subscription &&
            (subscription.status === 'active' ||
              subscription.status === 'trialing')
              ? (subscription.tier as SubscriptionTier)
              : 'free'
          yield* Effect.log(
            '[getCurrentSubscription] Effective tier:',
            effectiveTier
          )

          yield* Effect.log('[getCurrentSubscription] Fetching tier config...')
          const tierConfig = yield* subRepo.getTier(effectiveTier)
          yield* Effect.log('[getCurrentSubscription] Tier config:', tierConfig)

          yield* Console.log({
            subscription,
            usage,
            effectiveTier,
            tierConfig,
          })

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

      cancelSubscription: (userId: string) =>
        Effect.gen(function* () {
          const subscription = yield* subRepo.findByUserId(userId)

          if (!subscription) {
            return yield* Effect.fail(
              new SubscriptionNotFoundError({
                userId,
              })
            )
          }

          // Update local record (RevenueCat handles the actual cancellation via app stores)
          yield* subRepo.cancel(userId)

          // Log the cancellation
          yield* subRepo.logEvent(userId, 'subscription_canceled', {
            previousTier: subscription.tier,
          })
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
          const status = mapEventToStatus(eventData.type, eventData.period_type)

          // Calculate dates from milliseconds
          const purchasedAt = new Date(eventData.purchased_at_ms)
          const expiresAt = eventData.expiration_at_ms
            ? new Date(eventData.expiration_at_ms)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default to 30 days

          // Handle different event types
          const handleEvent = pipe(
            Match.value(eventData.type),
            Match.when('TEST', () =>
              Effect.gen(function* () {
                yield* Effect.log(
                  'Received RevenueCat TEST webhook - validation successful'
                )
              })
            ),
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
                  yield* subRepo.updateFromWebhook(
                    existingSub.externalSubscriptionId ?? '',
                    {
                      status: 'active',
                      currentPeriodStart: purchasedAt,
                      currentPeriodEnd: expiresAt,
                      // Clear trial dates on renewal
                      trialStartsAt: null,
                      trialEndsAt: null,
                    }
                  )
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
                  yield* subRepo.updateFromWebhook(
                    existingSub.externalSubscriptionId ?? '',
                    {
                      status: 'active',
                    }
                  )
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
                  yield* subRepo.updateFromWebhook(
                    existingSub.externalSubscriptionId ?? '',
                    {
                      productId,
                      currentPeriodStart: purchasedAt,
                      currentPeriodEnd: expiresAt,
                    }
                  )
                  yield* subRepo.logEvent(userId, 'subscription_updated', {
                    status: 'active',
                    eventType: 'PRODUCT_CHANGE',
                    newProductId: productId,
                  })
                }
              })
            ),
            Match.orElse(() =>
              Effect.gen(function* () {
                yield* Effect.log(
                  `Unhandled RevenueCat event type: ${eventData.type}`
                )
              })
            )
          )

          yield* handleEvent
        }),

      syncSubscription: (userId: string) =>
        Effect.gen(function* () {
          // Fetch subscriber info from RevenueCat
          const subscriberInfo =
            yield* revenueCatProvider.getSubscriberInfo(userId)

          // Find the active entitlement (we use 'premium' as the entitlement ID)
          const entitlements = subscriberInfo.subscriber.entitlements
          const premiumEntitlement = pipe(
            Option.fromNullable(entitlements.premium),
            Option.filter(
              (e) =>
                e.expires_date === null || new Date(e.expires_date) > new Date()
            )
          )

          // If there's an active premium entitlement, update the subscription
          if (Option.isSome(premiumEntitlement)) {
            const entitlement = premiumEntitlement.value
            const subscriptions = subscriberInfo.subscriber.subscriptions
            const productId = entitlement.product_identifier
            const subscriptionDetails = subscriptions[productId]

            // Determine status
            let status: SubscriptionStatus = 'active'
            if (subscriptionDetails) {
              if (subscriptionDetails.period_type === 'TRIAL') {
                status = 'trialing'
              } else if (subscriptionDetails.billing_issues_detected_at) {
                status = 'past_due'
              } else if (subscriptionDetails.unsubscribe_detected_at) {
                status = 'canceled'
              }
            }

            const purchaseDate = new Date(entitlement.purchase_date)
            const expiresDate = entitlement.expires_date
              ? new Date(entitlement.expires_date)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

            const store = mapRevenueCatStore(entitlement.store)

            // Create or update subscription
            yield* subRepo.create({
              userId,
              tier: 'paid',
              status,
              trialStartsAt:
                subscriptionDetails?.period_type === 'TRIAL'
                  ? purchaseDate
                  : null,
              trialEndsAt:
                subscriptionDetails?.period_type === 'TRIAL'
                  ? expiresDate
                  : null,
              currentPeriodStart: purchaseDate,
              currentPeriodEnd: expiresDate,
              externalSubscriptionId: productId,
              externalCustomerId:
                subscriberInfo.subscriber.original_app_user_id,
              provider: 'revenuecat',
              productId,
              store,
            })
          }

          // Return the current subscription state from our database
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
                  provider: 'revenuecat' as const,
                  productId: subscription.productId ?? undefined,
                  store: (subscription.store as AppStore) ?? undefined,
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

      getAllTiers: () => subRepo.getAllTiers(),
    }
  })
)
