import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import {
  RevenueCatProvider,
  RevenueCatProviderLive,
} from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import { ConfigProvider, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const AUTH = 'Bearer webhook-secret'

const testLayer = RevenueCatProviderLive.pipe(
  Layer.provide(MockAlerterLive),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        REVENUECAT_WEBHOOK_AUTH_KEY: 'webhook-secret',
      })
    )
  )
)

const event = {
  type: 'INITIAL_PURCHASE',
  id: 'evt-1',
  app_user_id: 'user-1',
  original_app_user_id: 'user-1',
  aliases: ['user-1'],
  product_id: 'lily_premium_monthly',
  entitlement_ids: ['premium'],
  store: 'APP_STORE',
  environment: 'PRODUCTION',
  purchased_at_ms: 1_700_000_000_000,
  expiration_at_ms: 1_702_592_000_000,
  period_type: 'NORMAL',
  presented_offering_id: 'default',
  country_code: 'FR',
}

const construct = (payload: unknown, authorization: string | undefined) =>
  Effect.gen(function* () {
    const provider = yield* RevenueCatProvider
    return yield* provider.constructWebhookEvent(
      JSON.stringify(payload),
      authorization
    )
  }).pipe(Effect.provide(testLayer))

describe('RevenueCatProviderLive.constructWebhookEvent', () => {
  it('accepts fields RevenueCat adds that the schema does not list', async () => {
    const result = await Effect.runPromise(
      construct({ api_version: '1.0', event }, AUTH)
    )

    expect(result.event).toMatchObject({
      id: 'evt-1',
      type: 'INITIAL_PURCHASE',
      country_code: 'FR',
    })
  })

  it('accepts event types newer than the shared enum', async () => {
    const result = await Effect.runPromise(
      construct(
        { api_version: '1.0', event: { ...event, type: 'REFUND_REVERSED' } },
        AUTH
      )
    )

    expect(result.event.type).toBe('REFUND_REVERSED')
  })

  it('rejects an event missing a required field', async () => {
    const { app_user_id: _, ...withoutUser } = event
    const exit = await Effect.runPromiseExit(
      construct({ api_version: '1.0', event: withoutUser }, AUTH)
    )

    expect(failureOf(exit)).toMatchObject({
      _tag: 'PaymentProviderError',
      code: 'webhook_schema_invalid',
    })
  })

  it('rejects a wrong authorization header', async () => {
    const exit = await Effect.runPromiseExit(
      construct({ api_version: '1.0', event }, 'Bearer nope')
    )

    expect(failureOf(exit)).toMatchObject({
      _tag: 'PaymentProviderError',
      code: 'webhook_auth_invalid',
    })
  })
})
