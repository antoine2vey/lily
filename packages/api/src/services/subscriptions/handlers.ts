import { HttpApiBuilder, HttpServerRequest } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import {
  AuthenticationLive,
  CurrentUser,
} from '@lily/api/services/auth/middleware.impl'
import { RevenueCatProviderLive } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
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
            yield* Effect.log('[Handler] getCurrentSubscription called')
            const currentUser = yield* CurrentUser
            yield* Effect.log('[Handler] CurrentUser:', currentUser)
            const result = yield* subscriptionService
              .getCurrentSubscription(currentUser.id)
              .pipe(
                Effect.tapError((error) =>
                  Effect.log('[Handler] Service error:', error)
                )
              )
            yield* Effect.log('[Handler] Service returned:', result)
            return result
          }).pipe(
            Effect.tapError((error) =>
              Effect.log('[Handler] Unhandled error:', error)
            )
          )
        )
        .handle('getTiers', () => subscriptionService.getAllTiers())
        .handle('cancelSubscription', () =>
          Effect.gen(function* () {
            const { id: userId } = yield* CurrentUser
            yield* subscriptionService.cancelSubscription(userId)
            return { message: 'Subscription canceled successfully' }
          })
        )
        .handle('syncSubscription', () =>
          Effect.gen(function* () {
            const { id: userId } = yield* CurrentUser
            return yield* subscriptionService.syncSubscription(userId)
          })
        )
    })
  ).pipe(
    Layer.provide(SubscriptionServiceLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(RevenueCatProviderLive),
    Layer.provide(AuthenticationLive)
  )

// Implement the Subscription Webhooks API group (unauthenticated)
export const SubscriptionWebhooksApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'subscription-webhooks', (handlers) =>
    Effect.gen(function* () {
      const subscriptionService = yield* SubscriptionService

      return handlers.handle('handleRevenueCatWebhook', ({ headers }) =>
        Effect.gen(function* () {
          // Get raw request body for authorization verification
          const request = yield* HttpServerRequest.HttpServerRequest
          const rawBody = yield* request.text

          yield* subscriptionService.handleRevenueCatWebhookEvent(
            rawBody,
            headers.authorization
          )

          return { received: true }
        })
      )
    })
  ).pipe(
    Layer.provide(SubscriptionServiceLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(RevenueCatProviderLive)
  )
