import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CreateSubscriptionData } from '@lily/api/repositories/subscription.repository'
import { revokeGiftSubscription } from '@lily/api/services/admin/endpoints/revoke-gift-subscription'
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
    mockAdminLayer
  )

describe('revokeGiftSubscription', () => {
  it('should revoke and set tier to free', async () => {
    let capturedUpdate: Partial<CreateSubscriptionData> | undefined

    const result = await Effect.runPromise(
      revokeGiftSubscription('user-1').pipe(
        Effect.provide(
          baseLayers({
            onUpdateByUserId: (_userId, data) => {
              capturedUpdate = data
            },
          })
        )
      )
    )

    expect(result.tier).toBe('free')
    expect(result.status).toBe('active')
    expect(result.userId).toBe('user-1')
    expect(capturedUpdate?.tier).toBe('free')
    expect(capturedUpdate?.status).toBe('active')
  })

  it('should fail when trying to revoke self', async () => {
    const result = await Effect.runPromiseExit(
      revokeGiftSubscription(mockAdminUser.id).pipe(
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
      revokeGiftSubscription('non-existent').pipe(Effect.provide(baseLayers()))
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
})
