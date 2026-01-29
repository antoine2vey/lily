import {
  type IPaymentProvider,
  PaymentProvider,
} from '@lily/api/services/subscriptions/payment-provider.interface'
import { PaymentProviderError } from '@lily/shared'
import { Config, Effect, Layer, Option, pipe } from 'effect'
import Stripe from 'stripe'

const TRIAL_DAYS = 7

export const StripePaymentProviderLive = Layer.effect(
  PaymentProvider,
  Effect.gen(function* () {
    const secretKey = yield* pipe(
      Config.string('STRIPE_SECRET_KEY'),
      Config.withDefault('')
    )
    const priceId = yield* pipe(
      Config.string('STRIPE_PRICE_ID_PAID'),
      Config.withDefault('')
    )
    const webhookSecret = yield* pipe(
      Config.string('STRIPE_WEBHOOK_SECRET'),
      Config.withDefault('')
    )

    yield* Effect.log('[StripeProvider] Initialized with config:', {
      hasSecretKey: secretKey.length > 0,
      hasPriceId: priceId.length > 0,
      hasWebhookSecret: webhookSecret.length > 0,
    })

    // Only create Stripe instance if configured
    const stripe =
      secretKey.length > 0
        ? new Stripe(secretKey, {
            apiVersion: '2025-12-15.clover',
          })
        : null

    const provider: IPaymentProvider = {
      createCheckoutSession: (params) =>
        Effect.gen(function* () {
          if (!stripe) {
            return yield* Effect.fail(
              new PaymentProviderError({
                message: 'Stripe not configured',
                code: 'stripe_not_configured',
              })
            )
          }
          return yield* Effect.tryPromise({
            try: async () => {
              const session = await stripe.checkout.sessions.create({
                customer_email: params.email,
                mode: 'subscription',
                line_items: [
                  {
                    price: priceId,
                    quantity: 1,
                  },
                ],
                subscription_data: {
                  trial_period_days: pipe(
                    Option.fromNullable(params.trialDays),
                    Option.getOrElse(() => TRIAL_DAYS)
                  ),
                  metadata: {
                    userId: params.userId,
                  },
                },
                metadata: {
                  userId: params.userId,
                },
                success_url: params.successUrl,
                cancel_url: params.cancelUrl,
              })

              if (!session.url) {
                throw new Error('No checkout URL returned from Stripe')
              }

              return {
                sessionId: session.id,
                url: session.url,
              }
            },
            catch: (error) =>
              new PaymentProviderError({
                message:
                  error instanceof Error
                    ? error.message
                    : 'Failed to create checkout session',
                code:
                  error instanceof Stripe.errors.StripeError
                    ? error.code
                    : undefined,
              }),
          })
        }),

      cancelSubscription: (externalSubscriptionId) =>
        Effect.gen(function* () {
          if (!stripe) {
            return yield* Effect.fail(
              new PaymentProviderError({
                message: 'Stripe not configured',
                code: 'stripe_not_configured',
              })
            )
          }
          return yield* Effect.tryPromise({
            try: async () => {
              await stripe.subscriptions.cancel(externalSubscriptionId)
            },
            catch: (error) =>
              new PaymentProviderError({
                message:
                  error instanceof Error
                    ? error.message
                    : 'Failed to cancel subscription',
                code:
                  error instanceof Stripe.errors.StripeError
                    ? error.code
                    : undefined,
              }),
          })
        }),

      constructWebhookEvent: (payload, signature) =>
        Effect.gen(function* () {
          if (!stripe) {
            return yield* Effect.fail(
              new PaymentProviderError({
                message: 'Stripe not configured',
                code: 'stripe_not_configured',
              })
            )
          }
          return yield* Effect.try({
            try: () => {
              const event = stripe.webhooks.constructEvent(
                payload,
                signature,
                webhookSecret
              )
              return {
                type: event.type,
                data: {
                  object: event.data.object as unknown as Record<
                    string,
                    unknown
                  >,
                },
              }
            },
            catch: (error) =>
              new PaymentProviderError({
                message:
                  error instanceof Error
                    ? error.message
                    : 'Invalid webhook signature',
                code: 'webhook_signature_invalid',
              }),
          })
        }),

      getSubscriptionDetails: (externalSubscriptionId) =>
        Effect.gen(function* () {
          if (!stripe) {
            return yield* Effect.fail(
              new PaymentProviderError({
                message: 'Stripe not configured',
                code: 'stripe_not_configured',
              })
            )
          }
          return yield* Effect.tryPromise({
            try: async () => {
              const subscription = await stripe.subscriptions.retrieve(
                externalSubscriptionId,
                { expand: ['items'] }
              )

              // Get period from first item (all items share the same billing period)
              const firstItem = subscription.items.data[0]
              const periodStart = pipe(
                Option.fromNullable(firstItem),
                Option.flatMap((item) =>
                  Option.fromNullable(item.current_period_start)
                ),
                Option.getOrElse(() => subscription.start_date)
              )
              const periodEnd = pipe(
                Option.fromNullable(firstItem),
                Option.flatMap((item) =>
                  Option.fromNullable(item.current_period_end)
                ),
                Option.getOrElse(() => subscription.start_date)
              )

              const result: {
                status: string
                currentPeriodStart: Date
                currentPeriodEnd: Date
                trialStart?: Date
                trialEnd?: Date
                customerId: string
              } = {
                status: subscription.status,
                currentPeriodStart: new Date(periodStart * 1000),
                currentPeriodEnd: new Date(periodEnd * 1000),
                customerId:
                  typeof subscription.customer === 'string'
                    ? subscription.customer
                    : subscription.customer.id,
              }

              if (subscription.trial_start) {
                result.trialStart = new Date(subscription.trial_start * 1000)
              }
              if (subscription.trial_end) {
                result.trialEnd = new Date(subscription.trial_end * 1000)
              }

              return result
            },
            catch: (error) =>
              new PaymentProviderError({
                message:
                  error instanceof Error
                    ? error.message
                    : 'Failed to get subscription details',
                code:
                  error instanceof Stripe.errors.StripeError
                    ? error.code
                    : undefined,
              }),
          })
        }),
    }

    return provider
  })
)
