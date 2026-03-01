import type { ISubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import {
  UsageTracker,
  UsageTrackerLive,
} from '@lily/api/services/subscriptions/usage-tracker'
import type { subscriptionUsage } from '@lily/db/schema'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('UsageTracker', () => {
  const createMockUsage = (
    overrides: Partial<typeof subscriptionUsage.$inferSelect> = {}
  ): typeof subscriptionUsage.$inferSelect => ({
    id: 'usage-1',
    userId: 'user-1',
    periodStart: new Date(),
    periodEnd: new Date(),
    aiChatsCount: 0,
    cardScansCount: 0,
    plantIdentifiesCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  // Helper to create test layer with tracking
  const createTestLayer = (options: {
    incrementUsageFn?: (
      userId: string,
      field: 'aiChats' | 'cardScans' | 'plantIdentifies'
    ) => typeof subscriptionUsage.$inferSelect
  }) => {
    const incrementCalls: Array<{
      userId: string
      field: 'aiChats' | 'cardScans' | 'plantIdentifies'
    }> = []

    const repo: ISubscriptionRepository = {
      findByUserId: () => Effect.succeed(null),
      findByExternalId: () => Effect.succeed(null),
      create: () => Effect.succeed(null),
      updateStatus: () => Effect.succeed(null),
      updateFromWebhook: () => Effect.succeed(null),
      updateByUserId: () => Effect.succeed(null),
      cancel: () => Effect.succeed(null),
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
      getCurrentUsage: () => Effect.succeed(createMockUsage()),
      getOrCreateUsage: () => Effect.succeed(createMockUsage()),
      incrementUsage: (userId, field) => {
        incrementCalls.push({ userId, field })
        const result = options.incrementUsageFn
          ? options.incrementUsageFn(userId, field)
          : createMockUsage({ [`${field}Count`]: 1 })
        return Effect.succeed(result)
      },
      logEvent: () => Effect.void,
    }

    return {
      layer: Layer.succeed(SubscriptionRepository, repo),
      incrementCalls,
    }
  }

  describe('trackAiChat', () => {
    it('should call incrementUsage with aiChats field', async () => {
      const { layer, incrementCalls } = createTestLayer({})

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          yield* tracker.trackAiChat('user-123')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(incrementCalls).toHaveLength(1)
      expect(incrementCalls[0]).toEqual({
        userId: 'user-123',
        field: 'aiChats',
      })
    })

    it('should return updated usage record', async () => {
      const expectedUsage = createMockUsage({ aiChatsCount: 5 })
      const { layer } = createTestLayer({
        incrementUsageFn: () => expectedUsage,
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.trackAiChat('user-1')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(result?.aiChatsCount).toBe(5)
    })
  })

  describe('trackCardScan', () => {
    it('should call incrementUsage with cardScans field', async () => {
      const { layer, incrementCalls } = createTestLayer({})

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          yield* tracker.trackCardScan('user-456')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(incrementCalls).toHaveLength(1)
      expect(incrementCalls[0]).toEqual({
        userId: 'user-456',
        field: 'cardScans',
      })
    })

    it('should return updated usage record', async () => {
      const expectedUsage = createMockUsage({ cardScansCount: 3 })
      const { layer } = createTestLayer({
        incrementUsageFn: () => expectedUsage,
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.trackCardScan('user-1')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(result?.cardScansCount).toBe(3)
    })
  })

  describe('trackPlantIdentify', () => {
    it('should call incrementUsage with plantIdentifies field', async () => {
      const { layer, incrementCalls } = createTestLayer({})

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          yield* tracker.trackPlantIdentify('user-789')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(incrementCalls).toHaveLength(1)
      expect(incrementCalls[0]).toEqual({
        userId: 'user-789',
        field: 'plantIdentifies',
      })
    })

    it('should return updated usage record', async () => {
      const expectedUsage = createMockUsage({ plantIdentifiesCount: 2 })
      const { layer } = createTestLayer({
        incrementUsageFn: () => expectedUsage,
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.trackPlantIdentify('user-1')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(result?.plantIdentifiesCount).toBe(2)
    })
  })

  describe('multiple tracking calls', () => {
    it('should correctly track multiple different operations', async () => {
      const { layer, incrementCalls } = createTestLayer({})

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          yield* tracker.trackAiChat('user-1')
          yield* tracker.trackCardScan('user-1')
          yield* tracker.trackPlantIdentify('user-1')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(incrementCalls).toHaveLength(3)
      expect(Array.map(incrementCalls, (c) => c.field)).toEqual([
        'aiChats',
        'cardScans',
        'plantIdentifies',
      ])
    })

    it('should track for different users independently', async () => {
      const { layer, incrementCalls } = createTestLayer({})

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          yield* tracker.trackAiChat('user-1')
          yield* tracker.trackAiChat('user-2')
        }).pipe(Effect.provide(UsageTrackerLive), Effect.provide(layer))
      )

      expect(incrementCalls).toHaveLength(2)
      expect(incrementCalls[0]?.userId).toBe('user-1')
      expect(incrementCalls[1]?.userId).toBe('user-2')
    })
  })
})
