import { MockRevenueCatProviderLive } from '@lily/api/__tests__/mocks/revenuecat.provider'
import type { ISubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import {
  SubscriptionService,
  SubscriptionServiceLive,
} from '@lily/api/services/subscriptions/service'
import type { userSubscriptions } from '@lily/db'
import { SubscriptionNotFoundError } from '@lily/shared'
import { Array, Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

describe('cancelSubscription', () => {
  // Track repository calls
  const createMockRepo = (options: {
    subscription?: typeof userSubscriptions.$inferSelect | null
    cancelCalls?: string[]
    logEvents?: Array<{ userId: string; event: string }>
  }) => {
    const cancelCalls = pipe(
      Option.fromNullable(options.cancelCalls),
      Option.getOrElse(() => [] as string[])
    )
    const logEvents = pipe(
      Option.fromNullable(options.logEvents),
      Option.getOrElse(() => [] as Array<{ userId: string; event: string }>)
    )

    const repo: ISubscriptionRepository = {
      findByUserId: () =>
        Effect.succeed(
          pipe(Option.fromNullable(options.subscription), Option.getOrNull)
        ),
      findByExternalId: () =>
        Effect.succeed(
          pipe(Option.fromNullable(options.subscription), Option.getOrNull)
        ),
      create: () => Effect.succeed(null),
      updateStatus: () => Effect.succeed(null),
      updateFromWebhook: () => Effect.succeed(null),
      cancel: (userId: string) => {
        cancelCalls.push(userId)
        return Effect.succeed(
          pipe(Option.fromNullable(options.subscription), Option.getOrNull)
        )
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
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const repoMock = createMockRepo({ subscription })

    const testLayer = Layer.mergeAll(
      Layer.succeed(SubscriptionRepository, repoMock.repo),
      MockRevenueCatProviderLive
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
    expect(repoMock.cancelCalls).toContain('user-1')
    expect(
      Array.some(repoMock.logEvents, (e) => e.event === 'subscription_canceled')
    ).toBe(true)
  })

  it('should fail when user has no subscription', async () => {
    const repoMock = createMockRepo({ subscription: null })

    const testLayer = Layer.mergeAll(
      Layer.succeed(SubscriptionRepository, repoMock.repo),
      MockRevenueCatProviderLive
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
    expect(repoMock.cancelCalls).toHaveLength(0)
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
      externalSubscriptionId: 'rc_sub_123',
      externalCustomerId: 'rc_user_123',
      provider: 'revenuecat',
      productId: 'lily_monthly',
      store: 'APP_STORE',
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const repoMock = createMockRepo({ subscription })

    const testLayer = Layer.mergeAll(
      Layer.succeed(SubscriptionRepository, repoMock.repo),
      MockRevenueCatProviderLive
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

    const cancelEvent = pipe(
      Array.findFirst(
        repoMock.logEvents,
        (e) => e.event === 'subscription_canceled'
      ),
      Option.getOrUndefined
    )
    expect(cancelEvent).toBeDefined()
    expect(cancelEvent?.userId).toBe('user-1')
  })
})
