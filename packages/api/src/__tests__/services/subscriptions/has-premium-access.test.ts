import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import type { userSubscriptions } from '@lily/db/schema'
import { describe, expect, it } from 'vitest'

type Subscription = typeof userSubscriptions.$inferSelect

const baseSubscription: Subscription = {
  id: 'sub-1',
  userId: 'user-1',
  tier: 'paid',
  status: 'active',
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: new Date('2024-01-01'),
  currentPeriodEnd: new Date('2099-12-31'),
  canceledAt: null,
  externalSubscriptionId: null,
  externalCustomerId: null,
  provider: 'revenuecat',
  productId: null,
  store: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const withOverrides = (overrides: Partial<Subscription>): Subscription => ({
  ...baseSubscription,
  ...overrides,
})

const futureDate = new Date('2099-12-31')
const pastDate = new Date('2020-01-01')

describe('hasPremiumAccess', () => {
  describe('active status', () => {
    it('should grant access when period is in the future', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'active', currentPeriodEnd: futureDate })
        )
      ).toBe(true)
    })

    it('should deny access when period has passed', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'active', currentPeriodEnd: pastDate })
        )
      ).toBe(false)
    })
  })

  describe('trialing status', () => {
    it('should grant access when trial period is in the future', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'trialing', currentPeriodEnd: futureDate })
        )
      ).toBe(true)
    })

    it('should deny access when trial period has passed', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'trialing', currentPeriodEnd: pastDate })
        )
      ).toBe(false)
    })
  })

  describe('canceled status', () => {
    it('should grant access until period ends', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'canceled', currentPeriodEnd: futureDate })
        )
      ).toBe(true)
    })

    it('should deny access after period ends', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'canceled', currentPeriodEnd: pastDate })
        )
      ).toBe(false)
    })
  })

  describe('past_due status', () => {
    it('should grant access until period ends', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'past_due', currentPeriodEnd: futureDate })
        )
      ).toBe(true)
    })

    it('should deny access after period ends', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'past_due', currentPeriodEnd: pastDate })
        )
      ).toBe(false)
    })
  })

  describe('expired status', () => {
    it('should deny access even with future period end', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'expired', currentPeriodEnd: futureDate })
        )
      ).toBe(false)
    })

    it('should deny access with past period end', () => {
      expect(
        hasPremiumAccess(
          withOverrides({ status: 'expired', currentPeriodEnd: pastDate })
        )
      ).toBe(false)
    })
  })

  describe('gifted subscription scenarios', () => {
    it('should grant access for infinite gift (2099 end date)', () => {
      expect(
        hasPremiumAccess(
          withOverrides({
            status: 'active',
            currentPeriodEnd: new Date(Date.UTC(2099, 11, 31)),
          })
        )
      ).toBe(true)
    })

    it('should deny access for expired 7-day gift', () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      expect(
        hasPremiumAccess(
          withOverrides({
            status: 'active',
            currentPeriodEnd: sevenDaysAgo,
          })
        )
      ).toBe(false)
    })
  })
})
