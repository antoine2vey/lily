import { HttpApiBuilder, HttpServerRequest } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import {
  AuthenticationLive,
  CurrentUser,
} from '@lily/api/services/auth/middleware'
import { StripePaymentProviderLive } from '@lily/api/services/subscriptions/providers/stripe.provider'
import {
  SubscriptionService,
  SubscriptionServiceLive,
} from '@lily/api/services/subscriptions/service'
import { Effect, Layer } from 'effect'

// Implement the Subscriptions API group (authenticated endpoints)
export const SubscriptionsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'subscriptions', (handlers) =>
    Effect.gen(function* () {
      const subscriptionService = yield* SubscriptionService

      return handlers
        .handle('getCurrentSubscription', () =>
          Effect.gen(function* () {
            const { id: userId } = yield* CurrentUser
            return yield* subscriptionService.getCurrentSubscription(userId)
          })
        )
        .handle('getTiers', () => subscriptionService.getAllTiers())
        .handle('createCheckoutSession', ({ payload }) =>
          Effect.gen(function* () {
            const currentUser = yield* CurrentUser
            return yield* subscriptionService.createCheckoutSession({
              userId: currentUser.id,
              email: currentUser.email,
              successUrl: payload.successUrl,
              cancelUrl: payload.cancelUrl,
            })
          })
        )
        .handle('cancelSubscription', () =>
          Effect.gen(function* () {
            const { id: userId } = yield* CurrentUser
            yield* subscriptionService.cancelSubscription(userId)
            return { message: 'Subscription canceled successfully' }
          })
        )
    })
  ).pipe(
    Layer.provide(SubscriptionServiceLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(StripePaymentProviderLive),
    Layer.provide(AuthenticationLive)
  )

// Implement the Subscription Webhooks API group (unauthenticated)
export const SubscriptionWebhooksApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'subscription-webhooks', (handlers) =>
    Effect.gen(function* () {
      const subscriptionService = yield* SubscriptionService

      return handlers.handle('handleWebhook', ({ headers }) =>
        Effect.gen(function* () {
          // Get raw request body for signature verification
          const request = yield* HttpServerRequest.HttpServerRequest
          const rawBody = yield* request.text

          yield* subscriptionService.handleWebhookEvent(
            rawBody,
            headers['stripe-signature']
          )

          return { received: true }
        })
      )
    })
  ).pipe(
    Layer.provide(SubscriptionServiceLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(StripePaymentProviderLive)
  )
