import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { PaymentProvider } from '@lily/api/services/subscriptions/payment-provider.interface'
import {
  type PaymentProviderError,
  type Subscription,
  SubscriptionNotFoundError,
  type SubscriptionStatus,
  type SubscriptionTier,
  type TierConfig,
} from '@lily/shared'
import { Context, Effect, Layer, Match, Option, pipe } from 'effect'

export interface CreateCheckoutParams {
  userId: string
  email: string
  successUrl: string
  cancelUrl: string
}

export interface ISubscriptionService {
  readonly getCurrentSubscription: (userId: string) => Effect.Effect<
    {
      subscription: Subscription | null
      usage: {
        aiChatsCount: number
        cardScansCount: number
        plantIdentifiesCount: number
      } | null
      tierConfig: TierConfig
    },
    SqlError
  >

  readonly createCheckoutSession: (
    params: CreateCheckoutParams
  ) => Effect.Effect<
    { sessionId: string; url: string },
    PaymentProviderError | SqlError
  >

  readonly cancelSubscription: (
    userId: string
  ) => Effect.Effect<
    void,
    SubscriptionNotFoundError | PaymentProviderError | SqlError
  >

  readonly handleWebhookEvent: (
    payload: string,
    signature: string
  ) => Effect.Effect<void, PaymentProviderError | SqlError>

  readonly getAllTiers: () => Effect.Effect<TierConfig[], SqlError>
}

export class SubscriptionService extends Context.Tag('SubscriptionService')<
  SubscriptionService,
  ISubscriptionService
>() {}

export const SubscriptionServiceLive = Layer.effect(
  SubscriptionService,
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const paymentProvider = yield* PaymentProvider

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

      createCheckoutSession: (params: CreateCheckoutParams) =>
        Effect.gen(function* () {
          const result = yield* paymentProvider.createCheckoutSession({
            userId: params.userId,
            email: params.email,
            successUrl: params.successUrl,
            cancelUrl: params.cancelUrl,
          })

          // Log the checkout attempt
          yield* subRepo.logEvent(params.userId, 'checkout_initiated', {
            sessionId: result.sessionId,
          })

          return result
        }),

      cancelSubscription: (userId: string) =>
        Effect.gen(function* () {
          const subscription = yield* subRepo.findByUserId(userId)

          if (!subscription || !subscription.externalSubscriptionId) {
            return yield* Effect.fail(
              new SubscriptionNotFoundError({
                userId,
              })
            )
          }

          // Cancel with payment provider
          yield* paymentProvider.cancelSubscription(
            subscription.externalSubscriptionId
          )

          // Update local record
          yield* subRepo.cancel(userId)

          // Log the cancellation
          yield* subRepo.logEvent(userId, 'subscription_canceled', {
            previousTier: subscription.tier,
          })
        }),

      handleWebhookEvent: (payload: string, signature: string) =>
        Effect.gen(function* () {
          const event = yield* paymentProvider.constructWebhookEvent(
            payload,
            signature
          )

          const handleCheckoutCompleted = Effect.gen(function* () {
            const session = event.data.object as {
              metadata?: { userId?: string }
              subscription?: string
              customer?: string
            }

            const userId = session.metadata?.userId
            const subscriptionId = session.subscription
            const customerId = session.customer

            if (!userId || !subscriptionId) {
              return
            }

            // Get subscription details from provider
            const details = yield* paymentProvider.getSubscriptionDetails(
              subscriptionId as string
            )

            // Create subscription record
            yield* subRepo.create({
              userId,
              tier: 'paid',
              status: details.status as SubscriptionStatus,
              trialStartsAt: Option.getOrNull(
                Option.fromNullable(details.trialStart)
              ),
              trialEndsAt: Option.getOrNull(
                Option.fromNullable(details.trialEnd)
              ),
              currentPeriodStart: details.currentPeriodStart,
              currentPeriodEnd: details.currentPeriodEnd,
              externalSubscriptionId: subscriptionId as string,
              externalCustomerId: customerId as string,
              provider: 'stripe',
            })

            yield* subRepo.logEvent(userId, 'subscription_created', {
              tier: 'paid',
              status: details.status,
              trialEnd: details.trialEnd,
            })
          })

          const handleSubscriptionUpdated = Effect.gen(function* () {
            const subscription = event.data.object as {
              id: string
              status: string
              current_period_start: number
              current_period_end: number
              trial_start?: number | null
              trial_end?: number | null
              metadata?: { userId?: string }
            }

            yield* subRepo.updateFromWebhook(subscription.id, {
              status: subscription.status as SubscriptionStatus,
              currentPeriodStart: new Date(
                subscription.current_period_start * 1000
              ),
              currentPeriodEnd: new Date(
                subscription.current_period_end * 1000
              ),
              trialStartsAt: subscription.trial_start
                ? new Date(subscription.trial_start * 1000)
                : null,
              trialEndsAt: subscription.trial_end
                ? new Date(subscription.trial_end * 1000)
                : null,
            })

            if (subscription.metadata?.userId) {
              yield* subRepo.logEvent(
                subscription.metadata.userId,
                'subscription_updated',
                {
                  status: subscription.status,
                }
              )
            }
          })

          const handleSubscriptionDeleted = Effect.gen(function* () {
            const subscription = event.data.object as {
              id: string
              metadata?: { userId?: string }
            }

            yield* subRepo.updateFromWebhook(subscription.id, {
              status: 'canceled',
            })

            if (subscription.metadata?.userId) {
              yield* subRepo.logEvent(
                subscription.metadata.userId,
                'subscription_deleted',
                {}
              )
            }
          })

          const handlePaymentFailed = Effect.gen(function* () {
            const invoice = event.data.object as {
              subscription?: string
              metadata?: { userId?: string }
            }

            if (invoice.subscription) {
              yield* subRepo.updateFromWebhook(invoice.subscription as string, {
                status: 'past_due',
              })

              if (invoice.metadata?.userId) {
                yield* subRepo.logEvent(
                  invoice.metadata.userId,
                  'payment_failed',
                  {}
                )
              }
            }
          })

          yield* pipe(
            Match.value(event.type),
            Match.when(
              'checkout.session.completed',
              () => handleCheckoutCompleted
            ),
            Match.when(
              'customer.subscription.updated',
              () => handleSubscriptionUpdated
            ),
            Match.when(
              'customer.subscription.deleted',
              () => handleSubscriptionDeleted
            ),
            Match.when('invoice.payment_failed', () => handlePaymentFailed),
            Match.orElse(() => Effect.void)
          )
        }),

      getAllTiers: () => subRepo.getAllTiers(),
    }
  })
)
