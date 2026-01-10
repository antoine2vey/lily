import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import type { IPaymentProvider } from '@lily/api/services/subscriptions/payment-provider.interface'
import { PaymentProvider } from '@lily/api/services/subscriptions/payment-provider.interface'
import {
  SubscriptionService,
  SubscriptionServiceLive,
} from '@lily/api/services/subscriptions/service'
import type { subscriptionUsage, userSubscriptions } from '@lily/db'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getCurrentSubscription', () => {
  // Mock payment provider - not needed for this endpoint but required by service
  const mockPaymentProvider: IPaymentProvider = {
    createCheckoutSession: () =>
      Effect.succeed({
        sessionId: 'sess_1',
        url: 'https://checkout.stripe.com',
      }),
    cancelSubscription: () => Effect.void,
    constructWebhookEvent: () =>
      Effect.succeed({ type: 'test', data: { object: {} } } as any),
    getSubscriptionDetails: () =>
      Effect.succeed({
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        customerId: '1'
      }),
  }

  const PaymentProviderMock = Layer.succeed(
    PaymentProvider,
    mockPaymentProvider
  )

  it('should return null subscription for user without subscription', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription: null }),
      PaymentProviderMock
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription).toBeNull()
    expect(result.tierConfig.tier).toBe('free')
  })

  it('should return subscription for active paid user', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'active',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: new Date('2024-01-01'),
      currentPeriodEnd: new Date('2024-02-01'),
      externalSubscriptionId: 'sub_123',
      externalCustomerId: 'cus_123',
      provider: 'stripe',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'paid' }),
      PaymentProviderMock
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription).not.toBeNull()
    expect(result.subscription?.tier).toBe('paid')
    expect(result.subscription?.status).toBe('active')
    expect(result.tierConfig.tier).toBe('paid')
    expect(result.tierConfig.maxPlants).toBeNull() // Unlimited
  })

  it('should return trialing subscription with correct tier', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'trialing',
      trialStartsAt: new Date(),
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      externalSubscriptionId: 'sub_123',
      externalCustomerId: 'cus_123',
      provider: 'stripe',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'paid' }),
      PaymentProviderMock
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription?.status).toBe('trialing')
    expect(result.subscription?.trialEndsAt).not.toBeNull()
    expect(result.tierConfig.tier).toBe('paid')
  })

  it('should return free tier config for expired subscription', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'expired',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      externalSubscriptionId: 'sub_123',
      externalCustomerId: 'cus_123',
      provider: 'stripe',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Expired subscription falls back to free tier
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'free' }),
      PaymentProviderMock
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription?.status).toBe('expired')
    expect(result.tierConfig.tier).toBe('free')
    expect(result.tierConfig.maxPlants).toBe(5)
  })

  it('should include usage data when available', async () => {
    const usage: typeof subscriptionUsage.$inferSelect = {
      id: 'usage-1',
      userId: 'user-1',
      periodStart: new Date(),
      periodEnd: new Date(),
      aiChatsCount: 5,
      cardScansCount: 2,
      plantIdentifiesCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ usage }),
      PaymentProviderMock
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(result.usage).not.toBeNull()
    expect(result.usage?.aiChatsCount).toBe(5)
    expect(result.usage?.cardScansCount).toBe(2)
    expect(result.usage?.plantIdentifiesCount).toBe(1)
  })

  it('should return null usage for user without usage record', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ usage: null }),
      PaymentProviderMock
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(result.usage).toBeNull()
  })
})
