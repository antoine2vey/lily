import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import {
  RevenueCatProvider,
  RevenueCatProviderLive,
} from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import { ConfigProvider, Effect, Layer } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

const AUTH = 'Bearer webhook-secret'

const layerWith = (config: Record<string, string>) =>
  RevenueCatProviderLive.pipe(
    Layer.provide(MockAlerterLive),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          REVENUECAT_WEBHOOK_AUTH_KEY: 'webhook-secret',
          ...config,
        })
      )
    )
  )

const testLayer = layerWith({})

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

  it('rejects a missing authorization header', async () => {
    const exit = await Effect.runPromiseExit(
      construct({ api_version: '1.0', event }, undefined)
    )

    expect(failureOf(exit)).toMatchObject({ code: 'webhook_auth_invalid' })
  })
})

describe('RevenueCatProviderLive.environment', () => {
  const environmentFor = (config: Record<string, string>) =>
    Effect.runPromise(
      Effect.map(RevenueCatProvider, (p) => p.environment).pipe(
        Effect.provide(layerWith(config))
      )
    )

  it('applies PRODUCTION events only on a production deploy', async () => {
    expect(await environmentFor({ NODE_ENV: 'production' })).toBe('PRODUCTION')
    expect(await environmentFor({ NODE_ENV: 'development' })).toBe('SANDBOX')
    expect(await environmentFor({})).toBe('SANDBOX')
  })
})

describe('RevenueCatProviderLive.getSubscriberInfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const fetchSubscriber = () =>
    Effect.runPromiseExit(
      Effect.gen(function* () {
        const provider = yield* RevenueCatProvider
        return yield* provider.getSubscriberInfo('user-1')
      }).pipe(Effect.provide(layerWith({ REVENUECAT_API_KEY: 'api-key' })))
    )

  // The documented v1 response: lowercase store names, extra fields, and a
  // numeric store_transaction_id for App Store purchases.
  const documentedResponse = {
    request_date: '2019-07-26T17:40:10Z',
    request_date_ms: 1564162810884,
    subscriber: {
      entitlements: {
        pro_cat: {
          expires_date: '2019-08-14T21:07:40Z',
          product_identifier: 'annual',
          purchase_date: '2019-07-14T21:07:40Z',
        },
      },
      first_seen: '2019-02-21T00:08:41Z',
      original_app_user_id: 'user-1',
      subscriptions: {
        onemonth: {
          billing_issues_detected_at: null,
          expires_date: '2019-06-17T22:47:55Z',
          is_sandbox: true,
          original_purchase_date: '2019-06-17T22:42:55Z',
          period_type: 'normal',
          purchase_date: '2019-06-17T22:42:55Z',
          store: 'app_store',
          store_transaction_id: 1000000652379790,
          unsubscribe_detected_at: '2019-06-17T22:48:38Z',
        },
      },
      non_subscriptions: {},
    },
  }

  it('decodes the documented subscriber response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(documentedResponse))
    )

    const exit = await fetchSubscriber()

    expect(exit._tag).toBe('Success')
    if (exit._tag === 'Success') {
      expect(exit.value.subscriber.subscriptions.onemonth).toMatchObject({
        store: 'app_store',
        is_sandbox: true,
        unsubscribe_detected_at: '2019-06-17T22:48:38Z',
      })
    }
  })

  it('fails on a non-2xx response so the webhook is retried', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 }))
    )

    expect(failureOf(await fetchSubscriber())).toMatchObject({
      code: 'revenuecat_api_error',
    })
  })

  it('fails on a response it cannot read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ subscriber: {} }))
    )

    expect(failureOf(await fetchSubscriber())).toMatchObject({
      code: 'revenuecat_schema_invalid',
    })
  })
})
