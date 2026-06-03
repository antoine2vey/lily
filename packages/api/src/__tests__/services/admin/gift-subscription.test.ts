import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CreateSubscriptionData } from '@lily/api/repositories/subscription.repository'
import { giftSubscription } from '@lily/api/services/admin/endpoints/gift-subscription'
import { AdminUser } from '@lily/api/services/admin/middleware'
import type { UserProfile } from '@lily/shared/auth'
import { Cause, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockAdminContext: UserProfile = {
  id: mockAdminUser.id,
  email: mockAdminUser.email,
  name: mockAdminUser.name,
  firstName: null,
  lastName: null,
  username: mockAdminUser.name ?? undefined,
  createdAt: mockAdminUser.createdAt,
  updatedAt: mockAdminUser.updatedAt,
  role: mockAdminUser.role,
  status: mockAdminUser.status,
}

const mockAdminLayer = Layer.succeed(AdminUser, mockAdminContext)

const baseLayers = (
  opts: Parameters<typeof createMockSubscriptionRepository>[0] = {}
) =>
  Layer.mergeAll(
    createMockUserRepository(mockUsers),
    createMockSubscriptionRepository(opts),
    createMockNotificationRepository([]),
    createMockMessageQueue(),
    mockAdminLayer
  )

describe('giftSubscription', () => {
  it('should gift a 7d subscription', async () => {
    let capturedData: CreateSubscriptionData | undefined

    const result = await Effect.runPromise(
      giftSubscription('user-1', '7d').pipe(
        Effect.provide(
          baseLayers({
            onCreate: (data) => {
              capturedData = data
            },
          })
        )
      )
    )

    expect(result.tier).toBe('paid')
    expect(result.status).toBe('active')
    expect(result.userId).toBe('user-1')
    expect(capturedData?.tier).toBe('paid')
    expect(capturedData?.status).toBe('active')

    // Period end should be ~7 days from now
    const diffMs = result.periodEnd.getTime() - result.periodStart.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(6.9)
    expect(diffDays).toBeLessThan(7.1)
  })

  it('should gift an infinite subscription with 2099 end date', async () => {
    const result = await Effect.runPromise(
      giftSubscription('user-1', 'infinite').pipe(Effect.provide(baseLayers()))
    )

    expect(result.periodEnd.getUTCFullYear()).toBe(2099)
  })

  it('should fail when trying to gift to self', async () => {
    const result = await Effect.runPromiseExit(
      giftSubscription(mockAdminUser.id, '1m').pipe(
        Effect.provide(baseLayers())
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('CannotModifySelfError')
      }
    }
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      giftSubscription('non-existent', '1m').pipe(Effect.provide(baseLayers()))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('UserNotFoundError')
      }
    }
  })

  it('should upsert over existing subscription', async () => {
    let capturedData: CreateSubscriptionData | undefined

    const result = await Effect.runPromise(
      giftSubscription('user-1', '1y').pipe(
        Effect.provide(
          baseLayers({
            subscription: {
              id: 'sub-1',
              userId: 'user-1',
              tier: 'free',
              status: 'active',
              trialStartsAt: null,
              trialEndsAt: null,
              currentPeriodStart: new Date('2024-01-01'),
              currentPeriodEnd: new Date('2024-02-01'),
              canceledAt: null,
              externalSubscriptionId: null,
              externalCustomerId: null,
              provider: 'revenuecat',
              productId: null,
              store: null,
              createdAt: new Date('2024-01-01'),
              updatedAt: new Date('2024-01-01'),
            },
            onCreate: (data) => {
              capturedData = data
            },
          })
        )
      )
    )

    expect(result.tier).toBe('paid')
    expect(result.status).toBe('active')
    expect(capturedData?.tier).toBe('paid')
  })

  it('should gift a 1m subscription', async () => {
    const result = await Effect.runPromise(
      giftSubscription('user-1', '1m').pipe(Effect.provide(baseLayers()))
    )

    const diffMs = result.periodEnd.getTime() - result.periodStart.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(29.9)
    expect(diffDays).toBeLessThan(30.1)
  })

  it('should refuse to overwrite a real store payer', async () => {
    const result = await Effect.runPromiseExit(
      giftSubscription('user-1', '1m').pipe(
        Effect.provide(
          baseLayers({
            subscription: {
              id: 'sub-1',
              userId: 'user-1',
              tier: 'paid',
              status: 'active',
              trialStartsAt: null,
              trialEndsAt: null,
              currentPeriodStart: new Date('2026-01-01'),
              currentPeriodEnd: new Date('2026-02-01'),
              canceledAt: null,
              externalSubscriptionId: 'rc_real_123',
              externalCustomerId: 'cust_1',
              provider: 'revenuecat',
              productId: 'lily_monthly',
              store: 'APP_STORE',
              createdAt: new Date('2026-01-01'),
              updatedAt: new Date('2026-01-01'),
            },
          })
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('StorePayerProtectedError')
      }
    }
  })
})
