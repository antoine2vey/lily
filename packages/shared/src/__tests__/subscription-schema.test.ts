import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AppStore,
  CancelSubscriptionResponse,
  PaymentProvider,
  Subscription,
  SubscriptionInfo,
  SubscriptionStatus,
  SubscriptionTier,
  SubscriptionUsage,
  TierConfig,
  UsageCounts,
  UsageField,
} from '../domains/subscriptions/schema'

// Test fixtures - use ISO strings for dates as that's what the schema expects for decoding
const validSubscription = {
  id: 'sub-123',
  userId: 'user-456',
  tier: 'paid' as const,
  status: 'active' as const,
  provider: 'revenuecat' as const,
  productId: 'lily_premium_monthly',
  store: 'APP_STORE' as const,
  trialStartsAt: '2024-01-01T00:00:00.000Z',
  trialEndsAt: '2024-01-07T00:00:00.000Z',
  currentPeriodStart: '2024-01-07T00:00:00.000Z',
  currentPeriodEnd: '2024-02-07T00:00:00.000Z',
  canceledAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-07T00:00:00.000Z',
}

const validTierConfig = {
  tier: 'paid' as const,
  name: 'Premium',
  priceMonthly: 4.99,
  maxPlants: null,
  maxAiChatsMonthly: 100,
  maxCardScansMonthly: 50,
  maxPlantIdentifiesMonthly: 50,
}

describe('Subscription Schemas', () => {
  describe('SubscriptionTier', () => {
    it('should accept valid tiers', () => {
      expect(Schema.decodeSync(SubscriptionTier)('free')).toBe('free')
      expect(Schema.decodeSync(SubscriptionTier)('paid')).toBe('paid')
    })

    it('should reject invalid tiers', () => {
      expect(() => Schema.decodeSync(SubscriptionTier)('premium')).toThrow()
      expect(() => Schema.decodeSync(SubscriptionTier)('enterprise')).toThrow()
    })
  })

  describe('SubscriptionStatus', () => {
    it('should accept all valid statuses', () => {
      const statuses = [
        'active',
        'trialing',
        'canceled',
        'expired',
        'past_due',
      ] as const

      for (const status of statuses) {
        expect(Schema.decodeSync(SubscriptionStatus)(status)).toBe(status)
      }
    })

    it('should reject invalid statuses', () => {
      expect(() => Schema.decodeSync(SubscriptionStatus)('pending')).toThrow()
      expect(() => Schema.decodeSync(SubscriptionStatus)('paused')).toThrow()
    })
  })

  describe('PaymentProvider', () => {
    it('should accept revenuecat', () => {
      expect(Schema.decodeSync(PaymentProvider)('revenuecat')).toBe(
        'revenuecat'
      )
    })

    it('should reject invalid providers', () => {
      expect(() => Schema.decodeSync(PaymentProvider)('stripe')).toThrow()
      expect(() => Schema.decodeSync(PaymentProvider)('paypal')).toThrow()
    })
  })

  describe('AppStore', () => {
    it('should accept valid stores', () => {
      expect(Schema.decodeSync(AppStore)('APP_STORE')).toBe('APP_STORE')
      expect(Schema.decodeSync(AppStore)('PLAY_STORE')).toBe('PLAY_STORE')
    })

    it('should reject invalid stores', () => {
      expect(() => Schema.decodeSync(AppStore)('AMAZON')).toThrow()
      expect(() => Schema.decodeSync(AppStore)('WEB')).toThrow()
    })
  })

  describe('TierConfig', () => {
    it('should decode valid tier config', () => {
      const result = Schema.decodeSync(TierConfig)(validTierConfig)

      expect(result.tier).toBe('paid')
      expect(result.name).toBe('Premium')
      expect(result.priceMonthly).toBe(4.99)
    })

    it('should decode free tier config', () => {
      const freeConfig = {
        tier: 'free' as const,
        name: 'Free',
        priceMonthly: 0,
        maxPlants: 5,
        maxAiChatsMonthly: 3,
        maxCardScansMonthly: 1,
        maxPlantIdentifiesMonthly: 3,
      }

      const result = Schema.decodeSync(TierConfig)(freeConfig)

      expect(result.tier).toBe('free')
      expect(result.maxPlants).toBe(5)
    })

    it('should accept null for unlimited features', () => {
      const config = {
        tier: 'paid' as const,
        name: 'Unlimited',
        priceMonthly: 9.99,
        maxPlants: null,
        maxAiChatsMonthly: null,
        maxCardScansMonthly: null,
        maxPlantIdentifiesMonthly: null,
      }

      const result = Schema.decodeSync(TierConfig)(config)

      expect(result.maxPlants).toBeNull()
      expect(result.maxAiChatsMonthly).toBeNull()
    })
  })

  describe('Subscription', () => {
    it('should decode a valid subscription', () => {
      const result = Schema.decodeSync(Subscription)(validSubscription)

      expect(result.id).toBe('sub-123')
      expect(result.tier).toBe('paid')
      expect(result.status).toBe('active')
      expect(result.provider).toBe('revenuecat')
    })

    it('should decode subscription without optional fields', () => {
      const minimalSubscription = {
        id: 'sub-123',
        userId: 'user-456',
        tier: 'free' as const,
        status: 'active' as const,
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: '2024-01-01T00:00:00.000Z',
        currentPeriodEnd: '2024-02-01T00:00:00.000Z',
        canceledAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }

      const result = Schema.decodeSync(Subscription)(minimalSubscription)

      expect(result.provider).toBeUndefined()
      expect(result.productId).toBeUndefined()
      expect(result.store).toBeUndefined()
    })

    it('should decode trialing subscription', () => {
      const trialingSubscription = {
        ...validSubscription,
        status: 'trialing' as const,
      }

      const result = Schema.decodeSync(Subscription)(trialingSubscription)

      expect(result.status).toBe('trialing')
    })

    it('should decode canceled subscription', () => {
      const canceledSubscription = {
        ...validSubscription,
        status: 'canceled' as const,
        canceledAt: '2024-01-15T00:00:00.000Z',
      }

      const result = Schema.decodeSync(Subscription)(canceledSubscription)

      expect(result.status).toBe('canceled')
      expect(result.canceledAt).toEqual(new Date('2024-01-15T00:00:00.000Z'))
    })

    it('should reject missing required fields', () => {
      const { userId, ...withoutUserId } = validSubscription

      expect(() => Schema.decodeSync(Subscription)(withoutUserId)).toThrow()
    })
  })

  describe('SubscriptionUsage', () => {
    it('should decode valid usage', () => {
      const usage = {
        id: 'usage-123',
        userId: 'user-456',
        periodStart: '2024-01-01T00:00:00.000Z',
        periodEnd: '2024-02-01T00:00:00.000Z',
        aiChatsCount: 5,
        cardScansCount: 2,
        plantIdentifiesCount: 3,
      }

      const result = Schema.decodeSync(SubscriptionUsage)(usage)

      expect(result.aiChatsCount).toBe(5)
      expect(result.cardScansCount).toBe(2)
      expect(result.plantIdentifiesCount).toBe(3)
    })

    it('should decode zero usage', () => {
      const usage = {
        id: 'usage-123',
        userId: 'user-456',
        periodStart: '2024-01-01T00:00:00.000Z',
        periodEnd: '2024-02-01T00:00:00.000Z',
        aiChatsCount: 0,
        cardScansCount: 0,
        plantIdentifiesCount: 0,
      }

      const result = Schema.decodeSync(SubscriptionUsage)(usage)

      expect(result.aiChatsCount).toBe(0)
    })
  })

  describe('UsageCounts', () => {
    it('should decode valid usage counts', () => {
      const counts = {
        aiChatsCount: 10,
        cardScansCount: 5,
        plantIdentifiesCount: 8,
      }

      const result = Schema.decodeSync(UsageCounts)(counts)

      expect(result.aiChatsCount).toBe(10)
      expect(result.cardScansCount).toBe(5)
      expect(result.plantIdentifiesCount).toBe(8)
    })

    it('should reject missing fields', () => {
      const partial = {
        aiChatsCount: 10,
        // Missing other counts
      }

      expect(() => Schema.decodeSync(UsageCounts)(partial)).toThrow()
    })
  })

  describe('SubscriptionInfo', () => {
    it('should decode full subscription info', () => {
      const info = {
        subscription: validSubscription,
        usage: {
          aiChatsCount: 5,
          cardScansCount: 2,
          plantIdentifiesCount: 3,
        },
        tierConfig: validTierConfig,
      }

      const result = Schema.decodeSync(SubscriptionInfo)(info)

      expect(result.subscription?.tier).toBe('paid')
      expect(result.usage?.aiChatsCount).toBe(5)
      expect(result.tierConfig.name).toBe('Premium')
    })

    it('should decode info with null subscription (free user)', () => {
      const info = {
        subscription: null,
        usage: null,
        tierConfig: {
          tier: 'free' as const,
          name: 'Free',
          priceMonthly: 0,
          maxPlants: 5,
          maxAiChatsMonthly: 3,
          maxCardScansMonthly: 1,
          maxPlantIdentifiesMonthly: 3,
        },
      }

      const result = Schema.decodeSync(SubscriptionInfo)(info)

      expect(result.subscription).toBeNull()
      expect(result.usage).toBeNull()
      expect(result.tierConfig.tier).toBe('free')
    })
  })

  describe('CancelSubscriptionResponse', () => {
    it('should decode valid cancel response', () => {
      const response = {
        subscription: {
          ...validSubscription,
          status: 'canceled' as const,
          canceledAt: '2024-01-15T00:00:00.000Z',
        },
        message: 'Subscription canceled successfully',
      }

      const result = Schema.decodeSync(CancelSubscriptionResponse)(response)

      expect(result.subscription.status).toBe('canceled')
      expect(result.message).toBe('Subscription canceled successfully')
    })
  })

  describe('UsageField', () => {
    it('should accept valid usage fields', () => {
      expect(Schema.decodeSync(UsageField)('aiChats')).toBe('aiChats')
      expect(Schema.decodeSync(UsageField)('cardScans')).toBe('cardScans')
      expect(Schema.decodeSync(UsageField)('plantIdentifies')).toBe(
        'plantIdentifies'
      )
    })

    it('should reject invalid usage fields', () => {
      expect(() => Schema.decodeSync(UsageField)('plants')).toThrow()
      expect(() => Schema.decodeSync(UsageField)('photos')).toThrow()
    })
  })
})
