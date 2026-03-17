import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import type { CreateSubscriptionData } from '@lily/api/repositories/subscription.repository'
import { handleInitialPurchase } from '@lily/api/services/subscriptions/endpoints/webhook/handlers/handle-initial-purchase'
import type { WebhookEventContext } from '@lily/api/services/subscriptions/endpoints/webhook/helpers'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'

describe('handleInitialPurchase', () => {
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

  it('should create a subscription for initial purchase', async () => {
    const result = await Effect.runPromiseExit(
      handleInitialPurchase(baseEventContext).pipe(
        Effect.provide(createMockSubscriptionRepository())
      )
    )

    expect(result._tag).toBe('Success')
  })

  it('should handle trial purchase correctly', async () => {
    const trialContext: WebhookEventContext = {
      ...baseEventContext,
      status: 'trialing',
      eventData: {
        ...baseEventContext.eventData,
        period_type: 'TRIAL',
      },
    }

    const result = await Effect.runPromiseExit(
      handleInitialPurchase(trialContext).pipe(
        Effect.provide(createMockSubscriptionRepository())
      )
    )

    expect(result._tag).toBe('Success')
  })

  it('should handle PLAY_STORE correctly', async () => {
    const playStoreContext: WebhookEventContext = {
      ...baseEventContext,
      store: 'PLAY_STORE',
      eventData: {
        ...baseEventContext.eventData,
        store: 'PLAY_STORE',
      },
    }

    const result = await Effect.runPromiseExit(
      handleInitialPurchase(playStoreContext).pipe(
        Effect.provide(createMockSubscriptionRepository())
      )
    )

    expect(result._tag).toBe('Success')
  })

  it('should handle null store', async () => {
    const noStoreContext: WebhookEventContext = {
      ...baseEventContext,
      store: null,
      eventData: {
        ...baseEventContext.eventData,
        store: 'UNKNOWN_STORE' as never,
      },
    }

    const result = await Effect.runPromiseExit(
      handleInitialPurchase(noStoreContext).pipe(
        Effect.provide(createMockSubscriptionRepository())
      )
    )

    expect(result._tag).toBe('Success')
  })

  it('should use event id when no original_transaction_id', async () => {
    const noTxnContext: WebhookEventContext = {
      ...baseEventContext,
      eventData: {
        ...baseEventContext.eventData,
        original_transaction_id: null,
      },
    }

    const result = await Effect.runPromiseExit(
      handleInitialPurchase(noTxnContext).pipe(
        Effect.provide(createMockSubscriptionRepository())
      )
    )

    expect(result._tag).toBe('Success')
  })

  describe('trial purchase argument verification', () => {
    it('should set status to trialing and trial dates for trial purchase', async () => {
      const onCreate = vi.fn()

      const trialContext: WebhookEventContext = {
        ...baseEventContext,
        status: 'trialing',
        purchasedAt: new Date('2024-01-01'),
        expiresAt: new Date('2024-01-08'),
        eventData: {
          ...baseEventContext.eventData,
          period_type: 'TRIAL',
        },
      }

      await Effect.runPromiseExit(
        handleInitialPurchase(trialContext).pipe(
          Effect.provide(createMockSubscriptionRepository({ onCreate }))
        )
      )

      expect(onCreate).toHaveBeenCalledOnce()
      const createData: CreateSubscriptionData = onCreate.mock
        .calls[0]?.[0] as CreateSubscriptionData
      expect(createData.status).toBe('trialing')
      expect(createData.trialStartsAt).toEqual(new Date('2024-01-01'))
      expect(createData.trialEndsAt).toEqual(new Date('2024-01-08'))
      expect(createData.currentPeriodStart).toEqual(new Date('2024-01-01'))
      expect(createData.currentPeriodEnd).toEqual(new Date('2024-01-08'))
    })

    it('should NOT set trial dates for normal purchase', async () => {
      const onCreate = vi.fn()

      await Effect.runPromiseExit(
        handleInitialPurchase(baseEventContext).pipe(
          Effect.provide(createMockSubscriptionRepository({ onCreate }))
        )
      )

      expect(onCreate).toHaveBeenCalledOnce()
      const createData: CreateSubscriptionData = onCreate.mock
        .calls[0]?.[0] as CreateSubscriptionData
      expect(createData.status).toBe('active')
      expect(createData.trialStartsAt).toBeNull()
      expect(createData.trialEndsAt).toBeNull()
    })

    it('should set trial dates to same values as currentPeriod dates', async () => {
      const onCreate = vi.fn()

      const trialContext: WebhookEventContext = {
        ...baseEventContext,
        status: 'trialing',
        purchasedAt: new Date('2024-03-01'),
        expiresAt: new Date('2024-03-08'),
        eventData: {
          ...baseEventContext.eventData,
          period_type: 'TRIAL',
        },
      }

      await Effect.runPromiseExit(
        handleInitialPurchase(trialContext).pipe(
          Effect.provide(createMockSubscriptionRepository({ onCreate }))
        )
      )

      const createData: CreateSubscriptionData = onCreate.mock
        .calls[0]?.[0] as CreateSubscriptionData
      expect(createData.trialStartsAt).toEqual(createData.currentPeriodStart)
      expect(createData.trialEndsAt).toEqual(createData.currentPeriodEnd)
    })
  })
})
