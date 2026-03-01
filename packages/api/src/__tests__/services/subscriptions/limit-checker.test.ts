import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import {
  LimitChecker,
  LimitCheckerLive,
} from '@lily/api/services/subscriptions/limit-checker'
import type { subscriptionUsage, userSubscriptions } from '@lily/db/schema'
import { LimitExceededError } from '@lily/shared'
import { DateTime, Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

// Helpers to create dates relative to now using DateTime
const now = DateTime.unsafeNow()
const dateFromNow = (parts: Partial<DateTime.DateTime.PartsForMath>): Date =>
  DateTime.toDateUtc(DateTime.add(now, parts))
const nowAsDate = (): Date => DateTime.toDateUtc(now)

describe('LimitChecker', () => {
  // Helper to create test layers
  const createTestLayers = (options: {
    subscription?: typeof userSubscriptions.$inferSelect | null
    usage?: typeof subscriptionUsage.$inferSelect | null
    tier?: 'free' | 'paid'
    plantCount?: number
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
          Option.fromNullable(options.plantCount),
          Option.getOrElse(() => 0)
        ),
      })
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = result.cause
        expect(error._tag).toBe('Fail')
        if (error._tag === 'Fail') {
          expect(error.error).toBeInstanceOf(LimitExceededError)
          expect((error.error as LimitExceededError).feature).toBe('plants')
          expect((error.error as LimitExceededError).limit).toBe(5)
          expect((error.error as LimitExceededError).current).toBe(5)
        }
      }
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe('checkAiChatLimit', () => {
    it('should allow free user under chat limit', async () => {
      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 5, // Under limit of 10
        cardScansCount: 0,
        plantIdentifiesCount: 0,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        tier: 'free',
        usage,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkAiChatLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should reject free user at chat limit', async () => {
      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 10, // At limit
        cardScansCount: 0,
        plantIdentifiesCount: 0,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        tier: 'free',
        usage,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkAiChatLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        const error = result.cause.error as LimitExceededError
        expect(error.feature).toBe('ai_chats')
        expect(error.limit).toBe(10)
        expect(error.current).toBe(10)
      }
    })

    it('should allow paid user unlimited chats', async () => {
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

      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 1000, // Way over free limit
        cardScansCount: 0,
        plantIdentifiesCount: 0,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        subscription,
        tier: 'paid',
        usage,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkAiChatLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })
  })

  describe('checkCardScanLimit', () => {
    it('should allow free user under scan limit', async () => {
      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 0,
        cardScansCount: 3, // Under limit of 5
        plantIdentifiesCount: 0,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        tier: 'free',
        usage,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkCardScanLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should reject free user at scan limit', async () => {
      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 0,
        cardScansCount: 5, // At limit
        plantIdentifiesCount: 0,
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        tier: 'free',
        usage,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkCardScanLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        const error = result.cause.error as LimitExceededError
        expect(error.feature).toBe('card_scans')
        expect(error.limit).toBe(5)
        expect(error.current).toBe(5)
      }
    })
  })

  describe('checkPlantIdentifyLimit', () => {
    it('should allow free user under identify limit', async () => {
      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 0,
        cardScansCount: 0,
        plantIdentifiesCount: 2, // Under limit of 3
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        tier: 'free',
        usage,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantIdentifyLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })

    it('should reject free user at identify limit', async () => {
      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: nowAsDate(),
        periodEnd: nowAsDate(),
        aiChatsCount: 0,
        cardScansCount: 0,
        plantIdentifiesCount: 3, // At limit
        createdAt: nowAsDate(),
        updatedAt: nowAsDate(),
      }

      const testLayer = createTestLayers({
        tier: 'free',
        usage,
      })

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantIdentifyLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        const error = result.cause.error as LimitExceededError
        expect(error.feature).toBe('plant_identifies')
        expect(error.limit).toBe(3)
        expect(error.current).toBe(3)
      }
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should allow trialing user with valid period for all limit types', async () => {
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

      // All limit checks should pass for trialing user with valid period
      const plantResult = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )
      expect(Exit.isSuccess(plantResult)).toBe(true)

      const chatResult = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkAiChatLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )
      expect(Exit.isSuccess(chatResult)).toBe(true)

      const scanResult = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkCardScanLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )
      expect(Exit.isSuccess(scanResult)).toBe(true)

      const identifyResult = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const limitChecker = yield* LimitChecker
          yield* limitChecker.checkPlantIdentifyLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )
      expect(Exit.isSuccess(identifyResult)).toBe(true)
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
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
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
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
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        const error = result.cause.error as LimitExceededError
        expect(error.feature).toBe('care_delegation')
        expect(error.message).toContain('premium feature')
      }
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
          yield* limitChecker.checkPlantLimit('user-1')
        }).pipe(Effect.provide(LimitCheckerLive), Effect.provide(testLayer))
      )

      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        const error = result.cause.error as LimitExceededError
        expect(error.message).toContain('Upgrade to Premium')
      }
    })
  })
})
