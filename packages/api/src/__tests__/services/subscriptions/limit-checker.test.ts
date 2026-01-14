import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import {
  LimitChecker,
  LimitCheckerLive,
} from '@lily/api/services/subscriptions/limit-checker'
import type { subscriptionUsage, userSubscriptions } from '@lily/db'
import { LimitExceededError } from '@lily/shared'
import { Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

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
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'stripe',
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'stripe',
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
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

    it('should enforce free limits for cancelled subscription', async () => {
      const subscription: typeof userSubscriptions.$inferSelect = {
        id: 'sub-1',
        userId: 'user-1',
        tier: 'paid',
        status: 'canceled',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'stripe',
        canceledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
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
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 5, // Under limit of 10
        cardScansCount: 0,
        plantIdentifiesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 10, // At limit
        cardScansCount: 0,
        plantIdentifiesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cus_123',
        provider: 'stripe',
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const usage: typeof subscriptionUsage.$inferSelect = {
        id: 'usage-1',
        userId: 'user-1',
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 1000, // Way over free limit
        cardScansCount: 0,
        plantIdentifiesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 0,
        cardScansCount: 3, // Under limit of 5
        plantIdentifiesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 0,
        cardScansCount: 5, // At limit
        plantIdentifiesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 0,
        cardScansCount: 0,
        plantIdentifiesCount: 2, // Under limit of 3
        createdAt: new Date(),
        updatedAt: new Date(),
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
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 0,
        cardScansCount: 0,
        plantIdentifiesCount: 3, // At limit
        createdAt: new Date(),
        updatedAt: new Date(),
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
