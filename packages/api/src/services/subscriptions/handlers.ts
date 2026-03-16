import { HttpApiBuilder, HttpServerRequest } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { CurrentUser } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { getCurrentSubscription } from '@lily/api/services/subscriptions/endpoints/get-current-subscription'
import { getTiers } from '@lily/api/services/subscriptions/endpoints/get-tiers'
import { handleRevenueCatWebhook } from '@lily/api/services/subscriptions/endpoints/webhook/handle-revenuecat-webhook'
import { Effect } from 'effect'

export const SubscriptionsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'subscriptions', (handlers) =>
    handlers
      .handle('getCurrentSubscription', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser
          return yield* getCurrentSubscription(currentUser.id)
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('getTiers', () => getTiers().pipe(withInfraErrorsAsDefect))
  )

export const SubscriptionWebhooksApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'subscription-webhooks', (handlers) =>
    handlers.handle('handleRevenueCatWebhook', ({ headers }) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const rawBody = yield* request.text

        yield* handleRevenueCatWebhook(rawBody, headers.authorization)

        return { received: true }
      }).pipe(withInfraErrorsAsDefect)
    )
  )
