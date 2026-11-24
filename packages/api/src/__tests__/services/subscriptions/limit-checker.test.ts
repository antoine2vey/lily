import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import {
  LimitChecker,
  LimitCheckerLive,
} from '@lily/api/services/subscriptions/limit-checker'
import type { subscriptionUsage, userSubscriptions } from '@lily/db/schema'
import { LimitExceededError, type TierConfig } from '@lily/shared'
import { failureOf } from '@lily/shared/testing'
import { DateTime, Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const now = DateTime.nowUnsafe()
const dateFromNow = (parts: Partial<DateTime.DateTime.PartsForMath>): Date =>
  DateTime.toDateUtc(DateTime.add(now, parts))
const nowAsDate = (): Date => DateTime.toDateUtc(now)

describe('LimitChecker', () => {
  const createTestLayers = (options: {
    subscription?: typeof userSubscriptions.$inferSelect | null
    usage?: typeof subscriptionUsage.$inferSelect | null
    tier?: 'free' | 'paid'
    plantCount?: number
    livingPlantCount?: number
  }) => {
    return Layer.mergeAll(
      createMockSubscriptionRepository({
        subscription: options.subscription,
        usage: options.usage,
        tier: options.tier,
      }),
      createMockAchievementRepository({
        achievements: [],
        plantCount: pipe(
          Option.fromNullishOr(options.plantCount),
          Option.getOrElse(() => 0)
        ),
        ...pipe(
          Option.fromNullishOr(options.livingPlantCount),
          Option.match({
            onNone: () => ({}),
            onSome: (livingPlantCount) => ({ livingPlantCount }),
          })
        ),
      }),
      createMockCanopyRepository()
    )
  }

  describe('checkPlantLimit', () => {
    it('should allow free user to create plant when under limit', async () => {
      const testLayer = createTestLayers({
        tier: 'free',
        plantCount: 3, // Under limit of 5
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should reject free user at plant limit', async () => {
      const testLayer = createTestLayers({
        tier: 'free',
        plantCount: 5, // At limit
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      const error = failureOf(result)
      expect(error).toBeInstanceOf(LimitExceededError)
      expect((error as LimitExceededError).feature).toBe('plants')
      expect((error as LimitExceededError).limit).toBe(5)
      expect((error as LimitExceededError).current).toBe(5)
    })

    it('should not count dead plants against the free limit', async () => {
      const testLayer = createTestLayers({
        tier: 'free',
        plantCount: 5, // Lifetime count is at the cap...
        livingPlantCount: 4, // ...but one is in the cemetery
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should allow paid user to create unlimited plants', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'active',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: nowAsDate(),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
        plantCount: 100, // Way over free limit
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should allow trialing user to create unlimited plants', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'trialing',
        trialStartsAt: nowAsDate(),
        trialEndsAt: dateFromNow({ days: 7 }),
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 7 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
        plantCount: 50,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should enforce free limits for expired subscription', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'expired',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: nowAsDate(),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'free', // Falls back to free tier
        plantCount: 5,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(failureOf(result)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'plants',
      })
    })

    it('should enforce free limits for cancelled subscription after period ends', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'canceled',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: dateFromNow({ days: -30 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: dateFromNow({ days: -7 }),
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'free',
        plantCount: 5,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(failureOf(result)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'plants',
      })
    })

    it('should allow canceled subscription with future period end', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'canceled',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 7 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: nowAsDate(),
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
        plantCount: 100, // Over free limit but within paid
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should allow past_due subscription with future period end (grace period)', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'past_due',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 5 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
        plantCount: 50,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should enforce free limits for past_due subscription after period ends', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'past_due',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: dateFromNow({ days: -30 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'free',
        plantCount: 5,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(failureOf(result)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'plants',
      })
    })
  })

  describe('plant cap when the tier table has gaps', () => {
    const freeRow: TierConfig = {
      tier: 'free',
      name: 'Free',
      priceMonthly: 0,
      maxPlants: 5,
      maxAiChatsMonthly: 10,
      maxCardScansMonthly: 5,
      maxPlantIdentifiesMonthly: 3,
    }
    const paidSubscription: typeof userSubscriptions.$inferSelect = {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'paid',
      status: 'active',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStart: nowAsDate(),
      currentPeriodEnd: dateFromNow({ days: 30 }),
      externalSubscriptionId: 'sub_123',
      externalCustomerId: 'cus_123',
      provider: 'revenuecat',
      productId: null,
      store: null,
      canceledAt: null,
      createdAt: nowAsDate(),
      updatedAt: nowAsDate(),
    }
    const checkWith = (options: {
      subscription: typeof userSubscriptions.$inferSelect | null
      tierRows: ReadonlyArray<TierConfig>
      livingPlants: number
    }) =>
      Effect.runPromiseExit(
        Effect.flatMap(LimitChecker, (checker) =>
          checker.checkPlantLimit({ _tag: 'User', userId: 'user-1' })
        ).pipe(
          Effect.provide(
            LimitCheckerLive.pipe(
              Layer.provide(
                Layer.mergeAll(
                  createMockSubscriptionRepository({
                    subscription: options.subscription,
                    tierRows: options.tierRows,
                  }),
                  createMockAchievementRepository({
                    achievements: [],
                    livingPlantCount: options.livingPlants,
                  }),
                  createMockCanopyRepository()
                )
              )
            )
          )
        )
      )

    it('caps a premium user at the free default when their tier has no row', async () => {
      const exit = await checkWith({
        subscription: paidSubscription,
        tierRows: [freeRow],
        livingPlants: 5,
      })

      expect(failureOf(exit)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'plants',
        limit: 5,
        current: 5,
      })
    })

    it('leaves a free user uncapped when the free tier has no plant limit', async () => {
      const exit = await checkWith({
        subscription: null,
        tierRows: [{ ...freeRow, maxPlants: null }],
        livingPlants: 50,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
    })
  })

  describe('trialing user with expired period', () => {
    it('should enforce free limits for trialing user with past currentPeriodEnd', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'trialing',
        trialStartsAt: dateFromNow({ days: -8 }),
        trialEndsAt: dateFromNow({ days: -1 }),
        currentPeriodStart: dateFromNow({ days: -8 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'free',
        plantCount: 5,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(failureOf(result)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'plants',
      })
    })

    it('should allow trialing user with valid period for the plant limit', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'trialing',
        trialStartsAt: nowAsDate(),
        trialEndsAt: dateFromNow({ days: 7 }),
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 7 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 100,
        cardScansCount: 50,
        plantIdentifiesCount: 20,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
        usage,
        plantCount: 50,
      })

      const plantResult = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )
      expect(Exit.isSuccess(plantResult)).toBe(true)
    })

    it('should enforce free limits for canceled-during-trial with expired period', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'canceled',
        trialStartsAt: dateFromNow({ days: -8 }),
        trialEndsAt: dateFromNow({ days: -1 }),
        currentPeriodStart: dateFromNow({ days: -8 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: dateFromNow({ days: -3 }),
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'free',
        plantCount: 5,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(failureOf(result)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'plants',
      })
    })

    it('should allow canceled-during-trial with valid period', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'canceled',
        trialStartsAt: nowAsDate(),
        trialEndsAt: dateFromNow({ days: 5 }),
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 5 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: nowAsDate(),
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
        plantCount: 50,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })
  })

  describe('checkDelegationAccess', () => {
    it('should allow paid tier users to create delegations', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'active',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 30 }),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'revenuecat',
        productId: null,
        store: null,
        canceledAt: null,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkDelegationAccess('user-1')
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should reject free tier users from creating delegations', async () => {
      const testLayer = createTestLayers({
        tier: 'free',
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkDelegationAccess('user-1')
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      const error = failureOf(result) as LimitExceededError
      expect(error.feature).toBe('care_delegation')
      expect(error.message).toContain('premium feature')
    })
  })

  describe('error message content', () => {
    it('should include helpful upgrade message', async () => {
      const testLayer = createTestLayers({
        tier: 'free',
        plantCount: 5,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit({
            _tag: 'User',
            userId: 'user-1',
          })
        }).pipe(Effect.provide(LimitCheckerLive.pipe(Layer.provide(testLayer))))
      )

      const error = failureOf(result) as LimitExceededError
      expect(error.message).toContain('Upgrade to Premium')
    })
  })
})
