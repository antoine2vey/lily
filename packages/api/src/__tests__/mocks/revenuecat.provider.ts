import {
  type IRevenueCatProvider,
  RevenueCatProvider,
} from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import {
  PaymentProviderError,
  type RevenueCatSubscriberInfo,
  type RevenueCatWebhookEvent,
} from '@lily/shared'
import { Effect, Layer } from 'effect'

export interface MockRevenueCatProviderOptions {
  constructWebhookEvent?: (
    payload: string,
    authorization: string | undefined
  ) => Effect.Effect<RevenueCatWebhookEvent, PaymentProviderError>
  getSubscriberInfo?: (
    appUserId: string
  ) => Effect.Effect<RevenueCatSubscriberInfo, PaymentProviderError>
}

export const createMockRevenueCatProvider = (
  options: MockRevenueCatProviderOptions = {}
): Layer.Layer<RevenueCatProvider> => {
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

  const provider: IRevenueCatProvider = {
    constructWebhookEvent: (payload, authorization) =>
      options.constructWebhookEvent
        ? options.constructWebhookEvent(payload, authorization)
        : Effect.fail(
            new PaymentProviderError({ message: 'Not implemented in mock' })
          ),
    getSubscriberInfo: (appUserId) =>
      options.getSubscriberInfo
        ? options.getSubscriberInfo(appUserId)
        : Effect.succeed(defaultSubscriberInfo),
  }

  return Layer.succeed(RevenueCatProvider, provider)
}

// Default mock that does nothing - useful for tests that don't need RevenueCat
export const MockRevenueCatProviderLive = createMockRevenueCatProvider()
