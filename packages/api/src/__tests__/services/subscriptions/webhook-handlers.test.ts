import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { handleBillingIssue } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-billing-issue'
import { handleCancellation } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-cancellation'
import { handleExpiration } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-expiration'
import { handleProductChange } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-product-change'
import { handleRenewal } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-renewal'
import { handleUncancellation } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-uncancellation'
import type { WebhookEventContext } from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

// Shared test fixtures
const baseEventContext: WebhookEventContext = {
  userId: 'user-123',
  productId: 'lily_premium_monthly',
  store: 'APP_STORE',
  status: 'active',
  purchasedAt: new Date('2024-01-01'),
  expiresAt: new Date('2024-02-01'),
  eventData: {
    type: 'INITIAL_PURCHASE',
    period_type: 'NORMAL',
    original_transaction_id: 'txn-123',
    id: 'event-123',
    original_app_user_id: 'rc-user-123',
    store: 'APP_STORE',
  },
}

const mockSubscription = {
  id: 'sub-123',
  userId: 'user-123',
  tier: 'paid' as const,
  status: 'active' as const,
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: new Date('2024-01-01'),
  currentPeriodEnd: new Date('2024-02-01'),
  externalSubscriptionId: 'txn-123',
  externalCustomerId: 'rc-user-123',
  provider: 'revenuecat' as const,
  productId: 'lily_premium_monthly',
  store: 'APP_STORE' as const,
  canceledAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

describe('Webhook Handlers', () => {
  describe('handleRenewal', () => {
    it('should update subscription on renewal when subscription exists', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        eventData: {
          ...baseEventContext.eventData,
          type: 'RENEWAL',
        },
      }

      const result = await Effect.runPromiseExit(
        handleRenewal(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: mockSubscription })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })

    it('should do nothing when subscription does not exist', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        eventData: {
          ...baseEventContext.eventData,
          type: 'RENEWAL',
        },
      }

      const result = await Effect.runPromiseExit(
        handleRenewal(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: null })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('handleCancellation', () => {
    it('should cancel subscription when subscription exists', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        status: 'canceled',
        eventData: {
          ...baseEventContext.eventData,
          type: 'CANCELLATION',
          cancel_reason: 'UNSUBSCRIBE',
        },
      }

      const result = await Effect.runPromiseExit(
        handleCancellation(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: mockSubscription })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })

    it('should handle cancellation with null reason', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        status: 'canceled',
        eventData: {
          ...baseEventContext.eventData,
          type: 'CANCELLATION',
          cancel_reason: null,
        },
      }

      const result = await Effect.runPromiseExit(
        handleCancellation(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: mockSubscription })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })

    it('should do nothing when subscription does not exist', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        status: 'canceled',
        eventData: {
          ...baseEventContext.eventData,
          type: 'CANCELLATION',
        },
      }

      const result = await Effect.runPromiseExit(
        handleCancellation(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: null })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('handleUncancellation', () => {
    it('should reactivate subscription when subscription exists', async () => {
      const canceledSub = {
        ...mockSubscription,
        status: 'canceled' as const,
        canceledAt: new Date('2024-01-15'),
      }

      const ctx: WebhookEventContext = {
        ...baseEventContext,
        eventData: {
          ...baseEventContext.eventData,
          type: 'UNCANCELLATION',
        },
      }

      const result = await Effect.runPromiseExit(
        handleUncancellation(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: canceledSub })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })

    it('should do nothing when subscription does not exist', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        eventData: {
          ...baseEventContext.eventData,
          type: 'UNCANCELLATION',
        },
      }

      const result = await Effect.runPromiseExit(
        handleUncancellation(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: null })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('handleExpiration', () => {
    it('should expire subscription when subscription exists', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        status: 'expired',
        eventData: {
          ...baseEventContext.eventData,
          type: 'EXPIRATION',
        },
      }

      const result = await Effect.runPromiseExit(
        handleExpiration(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: mockSubscription })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })

    it('should do nothing when subscription does not exist', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        status: 'expired',
        eventData: {
          ...baseEventContext.eventData,
          type: 'EXPIRATION',
        },
      }

      const result = await Effect.runPromiseExit(
        handleExpiration(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: null })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('handleBillingIssue', () => {
    it('should set subscription to past_due when subscription exists', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        status: 'past_due',
        eventData: {
          ...baseEventContext.eventData,
          type: 'BILLING_ISSUE',
        },
      }

      const result = await Effect.runPromiseExit(
        handleBillingIssue(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: mockSubscription })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })

    it('should do nothing when subscription does not exist', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        status: 'past_due',
        eventData: {
          ...baseEventContext.eventData,
          type: 'BILLING_ISSUE',
        },
      }

      const result = await Effect.runPromiseExit(
        handleBillingIssue(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: null })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('handleProductChange', () => {
    it('should update product when subscription exists', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        productId: 'lily_premium_yearly',
        eventData: {
          ...baseEventContext.eventData,
          type: 'PRODUCT_CHANGE',
        },
      }

      const result = await Effect.runPromiseExit(
        handleProductChange(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: mockSubscription })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })

    it('should do nothing when subscription does not exist', async () => {
      const ctx: WebhookEventContext = {
        ...baseEventContext,
        productId: 'lily_premium_yearly',
        eventData: {
          ...baseEventContext.eventData,
          type: 'PRODUCT_CHANGE',
        },
      }

      const result = await Effect.runPromiseExit(
        handleProductChange(ctx).pipe(
          Effect.provide(
            createMockSubscriptionRepository({ subscription: null })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })
  })
})
