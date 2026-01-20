import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import {
  clearRefreshTokenStore,
  createMockRefreshTokenRepository,
} from '@lily/api/__tests__/mocks/refresh-token.repository'
import { logout } from '@lily/api/services/auth/endpoints/logout'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('logout', () => {
  afterEach(() => {
    clearRefreshTokenStore()
  })

  const createTestLayer = (
    options: {
      userId?: string
      tokens?: {
        id: string
        userId: string
        tokenHash: string
        expiresAt: Date
        revokedAt: Date | null
        createdAt: Date
      }[]
    } = {}
  ) => {
    const userId = options.userId ?? mockUserProfile.id
    const tokens = options.tokens ?? [
      {
        id: 'token-1',
        userId,
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      },
      {
        id: 'token-2',
        userId,
        tokenHash: 'hash-2',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      },
    ]

    return Layer.mergeAll(
      createMockRefreshTokenRepository({ tokens }),
      Layer.succeed(CurrentUser, { ...mockUserProfile, id: userId })
    )
  }

  it('should revoke all refresh tokens for user', async () => {
    const result = await Effect.runPromise(
      logout().pipe(Effect.provide(createTestLayer()))
    )

    expect(result.message).toBe('Successfully logged out')
  })

  it('should return success message', async () => {
    const result = await Effect.runPromise(
      logout().pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toEqual({ message: 'Successfully logged out' })
  })

  it('should succeed even if user has no tokens', async () => {
    const result = await Effect.runPromise(
      logout().pipe(
        Effect.provide(
          createTestLayer({
            tokens: [],
          })
        )
      )
    )

    expect(result.message).toBe('Successfully logged out')
  })

  it('should only revoke tokens for current user', async () => {
    const currentUserId = 'user-current'
    const otherUserId = 'user-other'

    const tokens = [
      {
        id: 'token-1',
        userId: currentUserId,
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      },
      {
        id: 'token-2',
        userId: otherUserId,
        tokenHash: 'hash-2',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      },
    ]

    const result = await Effect.runPromise(
      logout().pipe(
        Effect.provide(
          createTestLayer({
            userId: currentUserId,
            tokens,
          })
        )
      )
    )

    expect(result.message).toBe('Successfully logged out')
  })

  it('should not fail if tokens are already revoked', async () => {
    const userId = mockUserProfile.id
    const tokens = [
      {
        id: 'token-1',
        userId,
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(), // Already revoked
        createdAt: new Date(),
      },
    ]

    const result = await Effect.runPromise(
      logout().pipe(
        Effect.provide(
          createTestLayer({
            tokens,
          })
        )
      )
    )

    expect(result.message).toBe('Successfully logged out')
  })
})
