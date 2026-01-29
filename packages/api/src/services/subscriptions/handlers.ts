import { HttpApiBuilder, HttpServerRequest } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import {
  AuthenticationLive,
  CurrentUser,
} from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RevenueCatProviderLive } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import { SubscriptionService } from '@lily/api/services/subscriptions/service'
import { Effect, Layer } from 'effect'

// Implement the Subscriptions API group (authenticated endpoints)
export const SubscriptionsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'subscriptions', (handlers) =>
    Effect.gen(function* () {
      const subscriptionService = yield* SubscriptionService

      return handlers
        .handle('getCurrentSubscription', () =>
          Effect.gen(function* () {
            const currentUser = yield* CurrentUser
            return yield* subscriptionService.getCurrentSubscription(
              currentUser.id
            )
          }).pipe(withInfraErrorsAsDefect)
        )
        .handle('getTiers', () =>
          subscriptionService.getAllTiers().pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(SubscriptionService.Default),
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
        }).pipe(withInfraErrorsAsDefect)
      )
    })
  ).pipe(
    Layer.provide(SubscriptionService.Default),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(RevenueCatProviderLive)
  )
