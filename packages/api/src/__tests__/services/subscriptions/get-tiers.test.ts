import { MockRevenueCatProviderLive } from '@lily/api/__tests__/mocks/revenuecat.provider'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { SubscriptionService } from '@lily/api/services/subscriptions/service'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getAllTiers', () => {
  it('should return all available tiers', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({}),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getAllTiers()
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    expect(result).toHaveLength(2)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: 'free' }),
        expect.objectContaining({ tier: 'paid' }),
      ])
    )
  })

  it('should include free tier config', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({}),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getAllTiers()
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    const freeTier = result.find((t) => t.tier === 'free')
    expect(freeTier).toBeDefined()
    expect(freeTier?.name).toBe('Free')
    expect(freeTier?.priceMonthly).toBe(0)
    expect(freeTier?.maxPlants).toBe(5)
    expect(freeTier?.maxAiChatsMonthly).toBe(10)
    expect(freeTier?.maxCardScansMonthly).toBe(5)
    expect(freeTier?.maxPlantIdentifiesMonthly).toBe(3)
  })

  it('should include paid tier config', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({}),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getAllTiers()
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    const paidTier = result.find((t) => t.tier === 'paid')
    expect(paidTier).toBeDefined()
    expect(paidTier?.name).toBe('Premium')
    expect(paidTier?.priceMonthly).toBe(299)
    // Paid tier has unlimited (null) limits
    expect(paidTier?.maxPlants).toBeNull()
    expect(paidTier?.maxAiChatsMonthly).toBeNull()
    expect(paidTier?.maxCardScansMonthly).toBeNull()
    expect(paidTier?.maxPlantIdentifiesMonthly).toBeNull()
  })

  it('should include tier limits in response', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({}),
      MockRevenueCatProviderLive
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getAllTiers()
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    for (const tier of result) {
      expect(tier).toHaveProperty('tier')
      expect(tier).toHaveProperty('name')
      expect(tier).toHaveProperty('priceMonthly')
      expect(tier).toHaveProperty('maxPlants')
      expect(tier).toHaveProperty('maxAiChatsMonthly')
      expect(tier).toHaveProperty('maxCardScansMonthly')
      expect(tier).toHaveProperty('maxPlantIdentifiesMonthly')
    }
  })

  it('should return tiers in consistent order', async () => {
    const testLayer = Layer.mergeAll(
      createMockSubscriptionRepository({}),
      MockRevenueCatProviderLive
    )

    const result1 = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getAllTiers()
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    const result2 = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.getAllTiers()
      }).pipe(
        Effect.provide(SubscriptionService.Default),
        Effect.provide(testLayer)
      )
    )

    expect(result1).toEqual(result2)
  })
})
