import {
  type IRevenueCatProvider,
  RevenueCatProvider,
} from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import {
  PaymentProviderError,
  type RevenueCatEnvironment,
  type RevenueCatSubscriberInfo,
  type RevenueCatWebhookEvent,
} from '@lily/shared'
import { Effect, Layer } from 'effect'

export interface MockRevenueCatProviderOptions {
  environment?: RevenueCatEnvironment
  constructWebhookEvent?: (
    payload: string,
    authorization: string | undefined
  ) => Effect.Effect<RevenueCatWebhookEvent, PaymentProviderError>
  getSubscriberInfo?: (
    appUserId: string
  ) => Effect.Effect<RevenueCatSubscriberInfo, PaymentProviderError>
}

export const emptySubscriberInfo: RevenueCatSubscriberInfo = {
  subscriber: {
    original_app_user_id: 'test-user',
    subscriptions: {},
  },
}

// The default parser trusts the payload: tests build events as JSON and the
// live provider's authorization check is covered by its own test.
const parseWebhookPayload = (
  payload: string
): Effect.Effect<RevenueCatWebhookEvent, PaymentProviderError> =>
  Effect.try({
    try: () => JSON.parse(payload) as RevenueCatWebhookEvent,
    catch: () =>
      new PaymentProviderError({
        message: 'Invalid webhook event structure',
        code: 'webhook_schema_invalid',
      }),
  })

export const createMockRevenueCatProvider = (
  options: MockRevenueCatProviderOptions = {}
): Layer.Layer<RevenueCatProvider> => {
  const provider: IRevenueCatProvider = {
    environment: options.environment ?? 'PRODUCTION',
    constructWebhookEvent: (payload, authorization) =>
      options.constructWebhookEvent
        ? options.constructWebhookEvent(payload, authorization)
        : parseWebhookPayload(payload),
    getSubscriberInfo: (appUserId) =>
      options.getSubscriberInfo
        ? options.getSubscriberInfo(appUserId)
        : Effect.succeed(emptySubscriberInfo),
  }

  return Layer.succeed(RevenueCatProvider, provider)
}

// Default mock that does nothing - useful for tests that don't need RevenueCat
export const MockRevenueCatProviderLive = createMockRevenueCatProvider()
