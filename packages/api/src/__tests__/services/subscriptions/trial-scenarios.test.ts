import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import type { userSubscriptions } from '@lily/db'
import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

// Helpers to create dates relative to now using DateTime
const now = DateTime.unsafeNow()
const dateFromNow = (parts: Partial<DateTime.DateTime.PartsForMath>): Date =>
  DateTime.toDateUtc(DateTime.add(now, parts))
const nowAsDate = (): Date => DateTime.toDateUtc(now)

// Helper to create a subscription with overrides
const createSubscription = (
  overrides: Partial<typeof userSubscriptions.$inferSelect> = {}
): typeof userSubscriptions.$inferSelect => ({
  id: 'sub-1',
  userId: 'user-1',
  tier: 'paid',
  status: 'active',
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: nowAsDate(),
  currentPeriodEnd: dateFromNow({ days: 7 }),
  externalSubscriptionId: 'sub_123',
  externalCustomerId: 'cus_123',
  provider: 'revenuecat',
  productId: 'lily_monthly',
  store: 'APP_STORE',
  canceledAt: null,
  createdAt: nowAsDate(),
  updatedAt: nowAsDate(),
  ...overrides,
})

describe('hasPremiumAccess - trial scenarios', () => {
  describe('trialing status', () => {
    it('should grant premium access for trialing user with future currentPeriodEnd', () => {
      const subscription = createSubscription({
        status: 'trialing',
        trialStartsAt: nowAsDate(),
        trialEndsAt: dateFromNow({ days: 7 }),
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 7 }),
      })

      expect(hasPremiumAccess(subscription)).toBe(true)
    })

    it('should deny premium access for trialing user with past currentPeriodEnd (webhook lag)', () => {
      const subscription = createSubscription({
        status: 'trialing',
        trialStartsAt: dateFromNow({ days: -8 }),
        trialEndsAt: dateFromNow({ days: -1 }),
        currentPeriodStart: dateFromNow({ days: -8 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
      })

      expect(hasPremiumAccess(subscription)).toBe(false)
    })
  })

  describe('canceled during trial', () => {
    it('should grant premium access for canceled-during-trial with future currentPeriodEnd', () => {
      const subscription = createSubscription({
        status: 'canceled',
        trialStartsAt: nowAsDate(),
        trialEndsAt: dateFromNow({ days: 5 }),
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 5 }),
        canceledAt: nowAsDate(),
      })

      expect(hasPremiumAccess(subscription)).toBe(true)
    })

    it('should deny premium access for canceled-during-trial with past currentPeriodEnd', () => {
      const subscription = createSubscription({
        status: 'canceled',
        trialStartsAt: dateFromNow({ days: -8 }),
        trialEndsAt: dateFromNow({ days: -1 }),
        currentPeriodStart: dateFromNow({ days: -8 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
        canceledAt: dateFromNow({ days: -3 }),
      })

      expect(hasPremiumAccess(subscription)).toBe(false)
    })
  })

  describe('expired trial', () => {
    it('should deny premium access for expired trial', () => {
      const subscription = createSubscription({
        status: 'expired',
        trialStartsAt: dateFromNow({ days: -8 }),
        trialEndsAt: dateFromNow({ days: -1 }),
        currentPeriodStart: dateFromNow({ days: -8 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
      })

      expect(hasPremiumAccess(subscription)).toBe(false)
    })
  })

  describe('active status (non-trial)', () => {
    it('should grant premium access for active subscription', () => {
      const subscription = createSubscription({
        status: 'active',
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 30 }),
      })

      expect(hasPremiumAccess(subscription)).toBe(true)
    })
  })

  describe('past_due status', () => {
    it('should grant premium access for past_due within billing period', () => {
      const subscription = createSubscription({
        status: 'past_due',
        currentPeriodStart: nowAsDate(),
        currentPeriodEnd: dateFromNow({ days: 5 }),
      })

      expect(hasPremiumAccess(subscription)).toBe(true)
    })

    it('should deny premium access for past_due after billing period', () => {
      const subscription = createSubscription({
        status: 'past_due',
        currentPeriodStart: dateFromNow({ days: -30 }),
        currentPeriodEnd: dateFromNow({ days: -1 }),
      })

      expect(hasPremiumAccess(subscription)).toBe(false)
    })
  })
})
