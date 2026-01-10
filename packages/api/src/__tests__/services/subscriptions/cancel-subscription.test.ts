import type { ISubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { IPaymentProvider } from '@lily/api/services/subscriptions/payment-provider.interface'
import { PaymentProvider } from '@lily/api/services/subscriptions/payment-provider.interface'
import {
  SubscriptionService,
  SubscriptionServiceLive,
} from '@lily/api/services/subscriptions/service'
import type { userSubscriptions } from '@lily/db'
import { PaymentProviderError, SubscriptionNotFoundError } from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('cancelSubscription', () => {
  // Track calls to payment provider
  const createMockPaymentProvider = (options: {
    cancelCalls?: string[]
    shouldFail?: boolean
  }) => {
    const cancelCalls = options.cancelCalls ?? []

    const provider: IPaymentProvider = {
      createCheckoutSession: () =>
        Effect.succeed({
          sessionId: 'sess_1',
          url: 'https://checkout.stripe.com',
        }),
      cancelSubscription: (subscriptionId: string) => {
        cancelCalls.push(subscriptionId)
        if (options.shouldFail) {
          return Effect.fail(
            new PaymentProviderError({
              message: 'Payment provider error',
              code: 'provider_error',
            })
          )
        }
        return Effect.void
      },
      constructWebhookEvent: () =>
        Effect.succeed({ type: 'test', data: { object: {} } } as any),
      getSubscriptionDetails: () =>
        Effect.succeed({
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          customerId: '1',
        }),
    }

    return { provider, cancelCalls }
  }

  // Track repository calls
  const createMockRepo = (options: {
    subscription?: typeof userSubscriptions.$inferSelect | null
    cancelCalls?: string[]
    logEvents?: Array<{ userId: string; event: string }>
  }) => {
    const cancelCalls = options.cancelCalls ?? []
    const logEvents = options.logEvents ?? []

    const repo: ISubscriptionRepository = {
      findByUserId: () => Effect.succeed(options.subscription ?? null),
      findByExternalId: () => Effect.succeed(options.subscription ?? null),
      create: () => Effect.succeed(null),
      updateStatus: () => Effect.succeed(null),
      updateFromWebhook: () => Effect.succeed(null),
      cancel: (userId: string) => {
        cancelCalls.push(userId)
        return Effect.succeed(options.subscription ?? null)
      },
      getTier: () =>
        Effect.succeed({
          tier: 'free' as const,
          name: 'Free',
          priceMonthly: 0,
          maxPlants: 5,
          maxAiChatsMonthly: 10,
          maxCardScansMonthly: 5,
          maxPlantIdentifiesMonthly: 3,
        }),
      getAllTiers: () => Effect.succeed([]),
      getCurrentUsage: () => Effect.succeed(null),
      getOrCreateUsage: () =>
        Effect.succeed({
          id: 'usage-1',
          userId: 'user-1',
          periodStart: new Date(),
          periodEnd: new Date(),
          aiChatsCount: 0,
          cardScansCount: 0,
          plantIdentifiesCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      incrementUsage: () =>
        Effect.succeed({
          id: 'usage-1',
          userId: 'user-1',
          periodStart: new Date(),
          periodEnd: new Date(),
          aiChatsCount: 1,
          cardScansCount: 0,
          plantIdentifiesCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      logEvent: (userId, event) => {
        logEvents.push({ userId, event })
        return Effect.void
      },
    }

    return { repo, cancelCalls, logEvents }
  }

  it('should cancel active subscription', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'active',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      externalSubscriptionId: 'sub_stripe_123',
      externalCustomerId: 'cus_123',
      provider: 'stripe',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const repoMock = createMockRepo({ subscription })
    const paymentMock = createMockPaymentProvider({})

    const testLayer = Layer.mergeAll(
      Layer.succeed(SubscriptionRepository, repoMock.repo),
      Layer.succeed(PaymentProvider, paymentMock.provider)
    )

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        yield* service.cancelSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(Exit.isSuccess(result)).toBe(true)
    expect(paymentMock.cancelCalls).toContain('sub_stripe_123')
    expect(repoMock.cancelCalls).toContain('user-1')
    expect(
      repoMock.logEvents.some((e) => e.event === 'subscription_canceled')
    ).toBe(true)
  })

  it('should fail when user has no subscription', async () => {
    const repoMock = createMockRepo({ subscription: null })
    const paymentMock = createMockPaymentProvider({})

    const testLayer = Layer.mergeAll(
      Layer.succeed(SubscriptionRepository, repoMock.repo),
      Layer.succeed(PaymentProvider, paymentMock.provider)
    )

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        yield* service.cancelSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(SubscriptionNotFoundError)
    }
    expect(paymentMock.cancelCalls).toHaveLength(0)
    expect(repoMock.cancelCalls).toHaveLength(0)
  })

  it('should fail when subscription has no external ID', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'active',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      externalSubscriptionId: null, // No external ID
      externalCustomerId: null,
      provider: 'stripe',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const repoMock = createMockRepo({ subscription })
    const paymentMock = createMockPaymentProvider({})

    const testLayer = Layer.mergeAll(
      Layer.succeed(SubscriptionRepository, repoMock.repo),
      Layer.succeed(PaymentProvider, paymentMock.provider)
    )

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        yield* service.cancelSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(paymentMock.cancelCalls).toHaveLength(0)
  })

  it('should log cancellation event with previous tier', async () => {
    const subscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'active',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      externalSubscriptionId: 'sub_stripe_123',
      externalCustomerId: 'cus_123',
      provider: 'stripe',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const repoMock = createMockRepo({ subscription })
    const paymentMock = createMockPaymentProvider({})

    const testLayer = Layer.mergeAll(
      Layer.succeed(SubscriptionRepository, repoMock.repo),
      Layer.succeed(PaymentProvider, paymentMock.provider)
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        yield* service.cancelSubscription('user-1')
      }).pipe(
        Effect.provide(SubscriptionServiceLive),
        Effect.provide(testLayer)
      )
    )

    const cancelEvent = repoMock.logEvents.find(
      (e) => e.event === 'subscription_canceled'
    )
    expect(cancelEvent).toBeDefined()
    expect(cancelEvent?.userId).toBe('user-1')
  })
})
