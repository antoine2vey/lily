import {
  type IPaymentProvider,
  PaymentProvider,
  type WebhookEvent,
} from '@lily/api/services/subscriptions/payment-provider.interface'
import {
  type IRevenueCatProvider,
  RevenueCatProvider,
} from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import type { RevenueCatSubscriberInfo } from '@lily/shared'
import { PaymentProviderError } from '@lily/shared'
import { Effect, Layer, Option, pipe } from 'effect'

export interface MockPaymentProviderOptions {
  checkoutSession?: {
    sessionId: string
    url: string
  }
  shouldFailCheckout?: boolean
  shouldFailCancel?: boolean
  shouldFailWebhook?: boolean
  webhookEvent?: WebhookEvent
  subscriptionDetails?: {
    status: string
    currentPeriodStart: Date
    currentPeriodEnd: Date
    trialStart?: Date
    trialEnd?: Date
    customerId: string
  }
  shouldFailGetDetails?: boolean
}

export const createMockPaymentProvider = (
  options: MockPaymentProviderOptions = {}
): Layer.Layer<PaymentProvider | RevenueCatProvider> => {
  const provider: IPaymentProvider = {
    createCheckoutSession: (params) =>
      Effect.gen(function* () {
        if (options.shouldFailCheckout) {
          return yield* Effect.fail(
            new PaymentProviderError({
              message: 'Failed to create checkout session',
            })
          )
        }

        return pipe(
          Option.fromNullable(options.checkoutSession),
          Option.getOrElse(() => ({
            sessionId: `cs_test_${crypto.randomUUID()}`,
            url: `https://checkout.stripe.com/pay/cs_test_${params.userId}`,
          }))
        )
      }),

    cancelSubscription: (_externalSubscriptionId) =>
      Effect.gen(function* () {
        if (options.shouldFailCancel) {
          return yield* Effect.fail(
            new PaymentProviderError({
              message: 'Failed to cancel subscription',
            })
          )
        }
      }),

    constructWebhookEvent: (_payload, _signature) =>
      Effect.gen(function* () {
        if (options.shouldFailWebhook) {
          return yield* Effect.fail(
            new PaymentProviderError({
              message: 'Invalid webhook signature',
            })
          )
        }

        return pipe(
          Option.fromNullable(options.webhookEvent),
          Option.getOrElse(() => ({
            type: 'unknown.event',
            data: {
              object: {},
            },
          }))
        )
      }),

    getSubscriptionDetails: (_externalSubscriptionId) =>
      Effect.gen(function* () {
        if (options.shouldFailGetDetails) {
          return yield* Effect.fail(
            new PaymentProviderError({
              message: 'Failed to get subscription details',
            })
          )
        }

        return pipe(
          Option.fromNullable(options.subscriptionDetails),
          Option.getOrElse(() => ({
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            customerId: 'cus_test_123',
          }))
        )
      }),
  }

  // Default RevenueCat mock that does nothing
  const defaultSubscriberInfo: RevenueCatSubscriberInfo = {
    request_date: new Date().toISOString(),
    request_date_ms: Date.now(),
    subscriber: {
      original_app_user_id: 'test-user',
      first_seen: new Date().toISOString(),
      entitlements: {},
      subscriptions: {},
      non_subscriptions: {},
    },
  }

  const revenueCatProvider: IRevenueCatProvider = {
    constructWebhookEvent: () =>
      Effect.fail(
        new PaymentProviderError({
          message: 'Not implemented in mock',
        })
      ),
    getSubscriberInfo: () => Effect.succeed(defaultSubscriberInfo),
  }

  return Layer.mergeAll(
    Layer.succeed(PaymentProvider, provider),
    Layer.succeed(RevenueCatProvider, revenueCatProvider)
  )
}
