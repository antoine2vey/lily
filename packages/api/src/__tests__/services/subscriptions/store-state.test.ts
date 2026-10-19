import {
  decideStoreSync,
  deriveStoreState,
  mapRevenueCatStore,
  toSubscriptionWrite,
} from '@lily/api/services/subscriptions/endpoints/webhook/store-state'
import type { userSubscriptions } from '@lily/db/schema'
import type {
  RevenueCatSubscriberInfo,
  RevenueCatSubscriberSubscription,
} from '@lily/shared'
import { DateTime, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const now = DateTime.makeUnsafe('2026-10-19T12:00:00Z')
const inDays = (days: number) => DateTime.toDateUtc(DateTime.add(now, { days }))
const isoInDays = (days: number) => inDays(days).toISOString()

// Shaped like the documented REST response: lowercase store and period_type.
const subscription = (
  overrides: Partial<RevenueCatSubscriberSubscription> = {}
): RevenueCatSubscriberSubscription => ({
  expires_date: isoInDays(20),
  purchase_date: isoInDays(-10),
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
  subscriber: { original_app_user_id: 'rc-user-1', subscriptions },
})

const derive = (
  subscriptions: Record<string, RevenueCatSubscriberSubscription>,
  environment: 'PRODUCTION' | 'SANDBOX' = 'PRODUCTION'
) =>
  Option.getOrThrow(
    deriveStoreState(subscriber(subscriptions), environment, now)
  )

const row = (
  overrides: Partial<typeof userSubscriptions.$inferSelect> = {}
): typeof userSubscriptions.$inferSelect => ({
  id: 'sub-1',
  userId: 'user-1',
  tier: 'paid',
  status: 'active',
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: inDays(-10),
  currentPeriodEnd: inDays(20),
  canceledAt: null,
  externalSubscriptionId: 'txn-1',
  externalCustomerId: 'rc-user-1',
  provider: 'revenuecat',
  productId: 'lily_monthly',
  store: 'APP_STORE',
  createdAt: inDays(-10),
  updatedAt: inDays(-10),
  ...overrides,
})

describe('deriveStoreState', () => {
  it('maps a running subscription to active with its billing period', () => {
    const state = derive({ lily_monthly: subscription() })

    expect(state).toMatchObject({
      status: 'active',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      periodStart: inDays(-10),
      periodEnd: inDays(20),
      trialStartsAt: null,
      canceledAt: null,
      externalCustomerId: 'rc-user-1',
    })
  })

  it('maps lowercase REST store names and trial periods', () => {
    const state = derive({
      lily_monthly: subscription({ store: 'play_store', period_type: 'trial' }),
    })

    expect(state.store).toBe('PLAY_STORE')
    expect(state.status).toBe('trialing')
    expect(state.trialStartsAt).toEqual(inDays(-10))
    expect(state.trialEndsAt).toEqual(inDays(20))
  })

  it('marks a past expiry as expired whatever else is set', () => {
    const state = derive({
      lily_monthly: subscription({
        expires_date: isoInDays(-1),
        unsubscribe_detected_at: isoInDays(-5),
      }),
    })

    expect(state.status).toBe('expired')
  })

  it('marks auto-renew off as canceled and keeps the cancellation instant', () => {
    const state = derive({
      lily_monthly: subscription({ unsubscribe_detected_at: isoInDays(-2) }),
    })

    expect(state.status).toBe('canceled')
    expect(state.canceledAt).toEqual(inDays(-2))
  })

  it('marks a billing issue as past_due', () => {
    const state = derive({
      lily_monthly: subscription({ billing_issues_detected_at: isoInDays(-1) }),
    })

    expect(state.status).toBe('past_due')
  })

  it('keeps the product that grants access the longest', () => {
    const state = derive({
      lily_monthly: subscription({ expires_date: isoInDays(-30) }),
      lily_yearly: subscription({ expires_date: isoInDays(300) }),
    })

    expect(state.productId).toBe('lily_yearly')
    expect(state.status).toBe('active')
  })

  it('ignores sandbox purchases in production and vice versa', () => {
    const subscriptions = {
      lily_monthly: subscription({ is_sandbox: true }),
    }

    expect(
      Option.isNone(
        deriveStoreState(subscriber(subscriptions), 'PRODUCTION', now)
      )
    ).toBe(true)
    expect(derive(subscriptions, 'SANDBOX').productId).toBe('lily_monthly')
  })

  it('is none for a subscriber who never bought anything', () => {
    expect(
      Option.isNone(deriveStoreState(subscriber({}), 'PRODUCTION', now))
    ).toBe(true)
  })

  it('treats a missing expiry as never expiring', () => {
    const state = derive({
      lily_lifetime: subscription({ expires_date: null }),
    })

    expect(state.status).toBe('active')
    expect(state.periodEnd.getUTCFullYear()).toBe(2099)
  })
})

describe('mapRevenueCatStore', () => {
  it('accepts webhook and REST spellings', () => {
    expect(mapRevenueCatStore('APP_STORE')).toBe('APP_STORE')
    expect(mapRevenueCatStore('play_store')).toBe('PLAY_STORE')
    expect(mapRevenueCatStore('stripe')).toBeNull()
  })
})

describe('decideStoreSync', () => {
  const storeWrite = (days: number, status: 'active' | 'expired' = 'active') =>
    toSubscriptionWrite(
      'user-1',
      {
        ...derive({
          lily_monthly: subscription({ expires_date: isoInDays(days) }),
        }),
        status,
      },
      'txn-1'
    )

  it('creates a row for a first purchase', () => {
    expect(decideStoreSync(null, storeWrite(20), now)).toEqual({
      _tag: 'Write',
      eventType: 'subscription_created',
    })
  })

  it('keeps a live gift that outlasts the store state', () => {
    const gift = row({
      externalSubscriptionId: null,
      externalCustomerId: null,
      productId: null,
      store: null,
      currentPeriodEnd: inDays(365),
    })

    expect(decideStoreSync(gift, storeWrite(-1, 'expired'), now)).toEqual({
      _tag: 'KeepGift',
    })
    expect(decideStoreSync(gift, storeWrite(20), now)).toEqual({
      _tag: 'KeepGift',
    })
  })

  it('replaces a gift the store subscription outlasts', () => {
    const gift = row({
      externalSubscriptionId: null,
      externalCustomerId: null,
      productId: null,
      store: null,
      currentPeriodEnd: inDays(7),
    })

    expect(decideStoreSync(gift, storeWrite(20), now)._tag).toBe('Write')
  })

  it('replaces an expired gift', () => {
    const gift = row({
      externalSubscriptionId: null,
      currentPeriodEnd: inDays(-1),
    })

    expect(decideStoreSync(gift, storeWrite(-1, 'expired'), now)._tag).toBe(
      'Write'
    )
  })

  it('is unchanged when the row already holds the store state', () => {
    expect(decideStoreSync(row(), storeWrite(20), now)).toEqual({
      _tag: 'Unchanged',
    })
  })

  it('names the transition in the event type', () => {
    const canceled = toSubscriptionWrite(
      'user-1',
      {
        ...derive({
          lily_monthly: subscription({
            unsubscribe_detected_at: isoInDays(-1),
          }),
        }),
      },
      'txn-1'
    )

    expect(decideStoreSync(row(), canceled, now)).toEqual({
      _tag: 'Write',
      eventType: 'subscription_canceled',
    })
    expect(decideStoreSync(row({ status: 'canceled' }), canceled, now)).toEqual(
      { _tag: 'Write', eventType: 'subscription_updated' }
    )
  })
})
