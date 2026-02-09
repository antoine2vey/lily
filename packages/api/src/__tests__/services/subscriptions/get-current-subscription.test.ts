import { MockRevenueCatProviderLive } from '@lily/api/__tests__/mocks/revenuecat.provider'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { SubscriptionService } from '@lily/api/services/subscriptions/service'
import type { subscriptionUsage, userSubscriptions } from '@lily/db'
import { DateTime, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Helpers to create dates relative to now using DateTime
const now = DateTime.unsafeNow()
const dateFromNow = (parts: Partial<DateTime.DateTime.PartsForMath>): Date =>
  DateTime.toDateUtc(DateTime.add(now, parts))
const nowAsDate = (): Date => DateTime.toDateUtc(now)

describe('getCurrentSubscription', () => {
  it('should return null subscription for user without subscription', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription: null }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
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
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'paid' }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
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
      trialStartsAt: nowAsDate(),
      trialEndsAt: dateFromNow({ days: 7 }),
      currentPeriodStart: nowAsDate(),
      currentPeriodEnd: nowAsDate(),
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'paid' }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
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
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Expired subscription falls back to free tier
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'free' }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
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
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
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
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    expect(result.usage).toBeNull()
  })

  it('should return paid tier config for canceled user within billing period', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'canceled',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: nowAsDate(),
      currentPeriodEnd: dateFromNow({ days: 7 }),
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: nowAsDate(),
      createdAt: nowAsDate(),
      updatedAt: nowAsDate(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'paid' }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription?.status).toBe('canceled')
    expect(result.tierConfig.tier).toBe('paid')
  })

  it('should return free tier config for canceled user past billing period', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'canceled',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: dateFromNow({ days: -30 }),
      currentPeriodEnd: dateFromNow({ days: -1 }),
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: dateFromNow({ days: -15 }),
      createdAt: nowAsDate(),
      updatedAt: nowAsDate(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'free' }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription?.status).toBe('canceled')
    expect(result.tierConfig.tier).toBe('free')
  })

  it('should return paid tier config for trialing user with valid period', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'trialing',
      trialStartsAt: nowAsDate(),
      trialEndsAt: dateFromNow({ days: 7 }),
      currentPeriodStart: nowAsDate(),
      currentPeriodEnd: dateFromNow({ days: 7 }),
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: null,
      createdAt: nowAsDate(),
      updatedAt: nowAsDate(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'paid' }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription?.status).toBe('trialing')
    expect(result.tierConfig.tier).toBe('paid')
    expect(result.tierConfig.maxPlants).toBeNull()
  })

  it('should return free tier config for trialing user with expired period', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'trialing',
      trialStartsAt: dateFromNow({ days: -8 }),
      trialEndsAt: dateFromNow({ days: -1 }),
      currentPeriodStart: dateFromNow({ days: -8 }),
      currentPeriodEnd: dateFromNow({ days: -1 }),
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: null,
      createdAt: nowAsDate(),
      updatedAt: nowAsDate(),
    }

    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({ subscription, tier: 'free' }),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getCurrentSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    expect(result.subscription?.status).toBe('trialing')
    expect(result.tierConfig.tier).toBe('free')
    expect(result.tierConfig.maxPlants).toBe(5)
  })
})
