import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockRevenueCatProvider } from '@lily/api/__tests__/mocks/revenuecat.provider'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { handleRevenueCatWebhook } from '@lily/api/services/subscriptions/endpoints/webhook/handle-revenuecat-webhook'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import { reconcileStoreSubscriptions } from '@lily/api/services/subscriptions/reconciliation-scheduler'
import type { userSubscriptions } from '@lily/db/schema'
import {
  PaymentProviderError,
  type RevenueCatEnvironment,
  type RevenueCatEventType,
  type RevenueCatSubscriberInfo,
  type RevenueCatSubscriberSubscription,
} from '@lily/shared'
import { DateTime, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const now = DateTime.nowUnsafe()
const inDays = (days: number) => DateTime.toDateUtc(DateTime.add(now, { days }))

const storeSubscription = (
  overrides: Partial<RevenueCatSubscriberSubscription> = {}
): RevenueCatSubscriberSubscription => ({
  expires_date: inDays(30).toISOString(),
  purchase_date: inDays(-1).toISOString(),
  store: 'app_store',
  is_sandbox: false,
  unsubscribe_detected_at: null,
  billing_issues_detected_at: null,
  period_type: 'normal',
  ...overrides,
})

const subscriber = (
  subscriptions: Record<string, RevenueCatSubscriberSubscription>
): RevenueCatSubscriberInfo => ({
  subscriber: { original_app_user_id: 'user-1', subscriptions },
})

const activeSubscriber = subscriber({ lily_monthly: storeSubscription() })
const expiredSubscriber = subscriber({
  lily_monthly: storeSubscription({ expires_date: inDays(-1).toISOString() }),
})

const webhookPayload = (
  type: RevenueCatEventType,
  id: string,
  environment: RevenueCatEnvironment = 'PRODUCTION'
) =>
  JSON.stringify({
    api_version: '1.0',
    event: {
      type,
      id,
      app_user_id: 'user-1',
      original_app_user_id: 'user-1',
      product_id: 'lily_monthly',
      store: 'APP_STORE',
      environment,
      purchased_at_ms: inDays(-1).getTime(),
      expiration_at_ms: inDays(30).getTime(),
      original_transaction_id: 'txn-1',
    },
  })

const giftRow: typeof userSubscriptions.$inferSelect = {
  id: 'sub-1',
  userId: 'user-1',
  tier: 'paid',
  status: 'active',
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: inDays(-2),
  currentPeriodEnd: new Date('2099-12-31T00:00:00Z'),
  canceledAt: null,
  externalSubscriptionId: null,
  externalCustomerId: null,
  provider: 'revenuecat',
  productId: null,
  store: null,
  createdAt: inDays(-2),
  updatedAt: inDays(-2),
}

const storeRow: typeof userSubscriptions.$inferSelect = {
  ...giftRow,
  externalSubscriptionId: 'txn-1',
  externalCustomerId: 'user-1',
  productId: 'lily_monthly',
  store: 'APP_STORE',
  currentPeriodStart: inDays(-1),
  currentPeriodEnd: inDays(30),
}

interface Harness {
  subscription?: typeof userSubscriptions.$inferSelect | null
  subscriberInfo?: Effect.Effect<RevenueCatSubscriberInfo, PaymentProviderError>
  environment?: RevenueCatEnvironment
}

const harness = (options: Harness = {}) => {
  const onCreate = vi.fn()
  const onLogEvent = vi.fn()
  let subscriberInfo =
    options.subscriberInfo ?? Effect.succeed(activeSubscriber)
  const setSubscriberInfo = (info: RevenueCatSubscriberInfo) => {
    subscriberInfo = Effect.succeed(info)
  }
  const getSubscriberInfo = vi.fn(() => subscriberInfo)
  const layer = Layer.mergeAll(
    createMockSubscriptionRepository({
      subscription: options.subscription ?? null,
      onCreate,
      onLogEvent,
    }),
    createMockRevenueCatProvider({
      environment: options.environment ?? 'PRODUCTION',
      getSubscriberInfo,
    })
  )
  const deliver = (payload: string) =>
    Effect.runPromiseExit(
      handleRevenueCatWebhook(payload, 'Bearer test').pipe(
        Effect.provide(layer)
      )
    )
  const currentRow = () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SubscriptionRepository
        return yield* repo.findByUserId('user-1')
      }).pipe(Effect.provide(layer))
    )
  return {
    deliver,
    currentRow,
    setSubscriberInfo,
    onCreate,
    onLogEvent,
    getSubscriberInfo,
    layer,
  }
}

describe('handleRevenueCatWebhook', () => {
  it('leaves the user premium when a stale EXPIRATION arrives after RENEWAL', async () => {
    const h = harness()

    expect(
      (await h.deliver(webhookPayload('RENEWAL', 'evt-renewal')))._tag
    ).toBe('Success')
    expect(
      (await h.deliver(webhookPayload('EXPIRATION', 'evt-expiration')))._tag
    ).toBe('Success')

    const row = await h.currentRow()
    expect(row?.status).toBe('active')
    expect(row?.currentPeriodEnd).toEqual(inDays(30))
    expect(row && hasPremiumAccess(row)).toBe(true)
  })

  it('writes one subscription event when the same event is delivered twice', async () => {
    const h = harness()

    await h.deliver(webhookPayload('INITIAL_PURCHASE', 'evt-1'))
    const second = await h.deliver(webhookPayload('INITIAL_PURCHASE', 'evt-1'))

    expect(second._tag).toBe('Success')
    expect(h.onLogEvent).toHaveBeenCalledTimes(1)
    expect(h.onCreate).toHaveBeenCalledTimes(1)
  })

  it('ignores a redelivered event even after the store state changed', async () => {
    const h = harness()

    await h.deliver(webhookPayload('INITIAL_PURCHASE', 'evt-1'))
    h.setSubscriberInfo(expiredSubscriber)
    await h.deliver(webhookPayload('INITIAL_PURCHASE', 'evt-1'))

    expect(h.onCreate).toHaveBeenCalledTimes(1)
    expect((await h.currentRow())?.status).toBe('active')
  })

  it('keeps an admin gift when an unrelated store event arrives', async () => {
    const h = harness({
      subscription: giftRow,
      subscriberInfo: Effect.succeed(expiredSubscriber),
    })

    const exit = await h.deliver(webhookPayload('EXPIRATION', 'evt-1'))

    expect(exit._tag).toBe('Success')
    expect(h.onCreate).not.toHaveBeenCalled()
    const row = await h.currentRow()
    expect(row).toEqual(giftRow)
    expect(row && hasPremiumAccess(row)).toBe(true)
  })

  it('replaces a shorter gift with a store subscription that outlasts it', async () => {
    const h = harness({
      subscription: { ...giftRow, currentPeriodEnd: inDays(7) },
    })

    await h.deliver(webhookPayload('INITIAL_PURCHASE', 'evt-1'))

    const row = await h.currentRow()
    expect(row?.externalSubscriptionId).toBe('txn-1')
    expect(row?.currentPeriodEnd).toEqual(inDays(30))
  })

  it('ignores sandbox events in production without touching RevenueCat', async () => {
    const h = harness({ environment: 'PRODUCTION' })

    const exit = await h.deliver(
      webhookPayload('INITIAL_PURCHASE', 'evt-1', 'SANDBOX')
    )

    expect(exit._tag).toBe('Success')
    expect(h.getSubscriberInfo).not.toHaveBeenCalled()
    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('acknowledges TEST events without touching RevenueCat', async () => {
    const h = harness()

    const exit = await h.deliver(webhookPayload('TEST', 'evt-test'))

    expect(exit._tag).toBe('Success')
    expect(h.getSubscriberInfo).not.toHaveBeenCalled()
  })

  it('fails the request when the RevenueCat fetch fails, and applies the retry', async () => {
    const failing = harness({
      subscriberInfo: Effect.fail(
        new PaymentProviderError({
          message: 'down',
          code: 'revenuecat_api_error',
        })
      ),
    })

    const exit = await failing.deliver(webhookPayload('RENEWAL', 'evt-1'))

    expect(failureOf(exit)).toMatchObject({
      _tag: 'PaymentProviderError',
      code: 'revenuecat_api_error',
    })
    expect(failing.onCreate).not.toHaveBeenCalled()

    const claimed = new Set<string>()
    const retryLayer = (
      info: Effect.Effect<RevenueCatSubscriberInfo, PaymentProviderError>
    ) =>
      Layer.mergeAll(
        createMockSubscriptionRepository({
          claimedWebhookEventIds: claimed,
          onCreate: failing.onCreate,
        }),
        createMockRevenueCatProvider({ getSubscriberInfo: () => info })
      )
    const run = (
      info: Effect.Effect<RevenueCatSubscriberInfo, PaymentProviderError>
    ) =>
      Effect.runPromiseExit(
        handleRevenueCatWebhook(webhookPayload('RENEWAL', 'evt-1'), 'x').pipe(
          Effect.provide(retryLayer(info))
        )
      )

    await run(
      Effect.fail(
        new PaymentProviderError({
          message: 'down',
          code: 'revenuecat_api_error',
        })
      )
    )
    expect(claimed.size).toBe(0)
    await run(Effect.succeed(activeSubscriber))
    expect(claimed.has('evt-1')).toBe(true)
    expect(failing.onCreate).toHaveBeenCalledTimes(1)
  })

  it('does not write when the row already matches the store', async () => {
    const h = harness({ subscription: storeRow })

    await h.deliver(webhookPayload('RENEWAL', 'evt-1'))

    expect(h.onCreate).not.toHaveBeenCalled()
    expect(h.onLogEvent).not.toHaveBeenCalled()
  })
})

describe('reconcileStoreSubscriptions', () => {
  it('repairs a store-linked row the webhooks missed', async () => {
    const h = harness({
      subscription: storeRow,
      subscriberInfo: Effect.succeed(expiredSubscriber),
    })

    await Effect.runPromise(
      reconcileStoreSubscriptions.pipe(Effect.provide(h.layer))
    )

    const row = await h.currentRow()
    expect(row?.status).toBe('expired')
    expect(row?.externalSubscriptionId).toBe('txn-1')
    expect(h.onLogEvent).toHaveBeenCalledWith(
      'user-1',
      'subscription_updated',
      expect.objectContaining({ source: 'reconciliation' })
    )
  })

  it('leaves gift rows alone', async () => {
    const h = harness({
      subscription: giftRow,
      subscriberInfo: Effect.succeed(expiredSubscriber),
    })

    await Effect.runPromise(
      reconcileStoreSubscriptions.pipe(Effect.provide(h.layer))
    )

    expect(h.getSubscriberInfo).not.toHaveBeenCalled()
    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('keeps going when one fetch fails', async () => {
    const h = harness({
      subscription: storeRow,
      subscriberInfo: Effect.fail(
        new PaymentProviderError({
          message: 'down',
          code: 'revenuecat_api_error',
        })
      ),
    })

    const exit = await Effect.runPromiseExit(
      reconcileStoreSubscriptions.pipe(Effect.provide(h.layer))
    )

    expect(exit._tag).toBe('Success')
    expect(h.onCreate).not.toHaveBeenCalled()
  })
})
