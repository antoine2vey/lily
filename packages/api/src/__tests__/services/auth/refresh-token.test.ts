import {
  createMockRefreshToken,
  mockExpiredRefreshToken,
  mockRefreshToken,
  mockRevokedRefreshToken,
} from '@lily/api/__tests__/fixtures/refresh-tokens'
import {
  mockSuspendedUser,
  mockUser1,
  mockUsers,
} from '@lily/api/__tests__/fixtures/users'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import {
  clearRefreshTokenStore,
  createMockRefreshTokenRepository,
  getRefreshTokenStore,
} from '@lily/api/__tests__/mocks/refresh-token.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { refreshToken } from '@lily/api/services/auth/endpoints/refresh-token'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('refreshToken', () => {
  afterEach(() => {
    clearRefreshTokenStore()
  })

  const createTestLayer = (
    options: {
      tokens?: (typeof mockRefreshToken)[]
      users?: typeof mockUsers
      jwtOptions?: Parameters<typeof createMockJWTService>[0]
      rateLimiterOptions?: Parameters<typeof createMockRateLimiterService>[0]
    } = {}
  ) =>
    Layer.mergeAll(
      createMockRefreshTokenRepository({
        tokens: options.tokens ?? [mockRefreshToken],
      }),
      createMockUserRepository(options.users ?? mockUsers),
      createMockJWTService(options.jwtOptions ?? {}),
      createMockRateLimiterService(options.rateLimiterOptions ?? {})
    )

  it('should return new access token for valid refresh token', async () => {
    // The mock JWT service returns a predictable hash
    const result = await Effect.runPromise(
      refreshToken({ refreshToken: 'valid-refresh-token' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.accessToken).toBeDefined()
    expect(result.expiresIn).toBe(15 * 60) // 15 minutes in seconds
  })

  it('should fail with invalid refresh token', async () => {
    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'completely-invalid-token' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [], // No tokens in store
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with expired refresh token', async () => {
    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'expired-token' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [mockExpiredRefreshToken],
            jwtOptions: {
              refreshTokenHash: mockExpiredRefreshToken.tokenHash,
            },
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with revoked refresh token', async () => {
    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'revoked-token' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [mockRevokedRefreshToken],
            jwtOptions: {
              refreshTokenHash: mockRevokedRefreshToken.tokenHash,
            },
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when user not found', async () => {
    // Token references a user that doesn't exist
    const tokenForMissingUser = {
      ...mockRefreshToken,
      userId: 'non-existent-user',
    }

    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'token-for-missing-user' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [tokenForMissingUser],
            users: [], // No users
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail for suspended user', async () => {
    const tokenForSuspendedUser = {
      ...mockRefreshToken,
      userId: mockSuspendedUser.id,
    }

    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'token-for-suspended-user' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [tokenForSuspendedUser],
            users: [mockSuspendedUser],
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail for banned user', async () => {
    const bannedUser = {
      ...mockUser1,
      id: 'user-banned',
      status: 'banned' as const,
    }
    const tokenForBannedUser = {
      ...mockRefreshToken,
      userId: bannedUser.id,
    }

    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'token-for-banned-user' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [tokenForBannedUser],
            users: [bannedUser],
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return correct expiry time', async () => {
    const result = await Effect.runPromise(
      refreshToken({ refreshToken: 'valid-refresh-token' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.expiresIn).toBe(900) // 15 * 60 = 900 seconds
  })

  it('should recover when a rotation response was lost (revoked token whose successor is still active)', async () => {
    // The client presented a token that was already rotated server-side, but it
    // never received the successor (e.g. dropped connection on app relaunch).
    // The successor is still active, so we recover instead of logging out.
    const successor = createMockRefreshToken({
      id: 'refresh-token-successor',
      tokenHash: 'successor-hash',
      revokedAt: null,
    })
    const presented = createMockRefreshToken({
      id: 'refresh-token-presented',
      tokenHash: 'presented-hash',
      revokedAt: new Date(Date.now() - 60 * 1000),
      replacedBy: successor.id,
    })

    const result = await Effect.runPromise(
      refreshToken({ refreshToken: 'lost-response-token' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [presented, successor],
            jwtOptions: { refreshTokenHash: presented.tokenHash },
          })
        )
      )
    )

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()

    // The recovered successor should now be revoked and linked forward.
    const store = getRefreshTokenStore()
    const rotatedSuccessor = store.find((t) => t.id === successor.id)
    expect(rotatedSuccessor?.revokedAt).not.toBeNull()
    expect(rotatedSuccessor?.replacedBy).toBeDefined()
  })

  it('should detect reuse and revoke the whole family when a superseded token is replayed', async () => {
    // Both the presented token and its successor are already revoked: the chain
    // has moved on, so replaying the old token signals theft.
    const successor = createMockRefreshToken({
      id: 'refresh-token-successor-2',
      tokenHash: 'successor-hash-2',
      revokedAt: new Date(Date.now() - 30 * 1000),
    })
    const presented = createMockRefreshToken({
      id: 'refresh-token-presented-2',
      tokenHash: 'presented-hash-2',
      revokedAt: new Date(Date.now() - 60 * 1000),
      replacedBy: successor.id,
    })
    // A separate active token for the same user must be revoked by the breach.
    const otherActive = createMockRefreshToken({
      id: 'refresh-token-other-active',
      tokenHash: 'other-active-hash',
      revokedAt: null,
    })

    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'reused-token' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [presented, successor, otherActive],
            jwtOptions: { refreshTokenHash: presented.tokenHash },
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')

    // All of the user's tokens should have been revoked (reuse → kill family).
    const store = getRefreshTokenStore()
    const stillActive = store.filter(
      (t) => t.userId === 'user-1' && t.revokedAt === null
    )
    expect(stillActive).toHaveLength(0)
  })

  it('should propagate a rate limit as RateLimitExceededError (429)', async () => {
    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'valid-refresh-token' }).pipe(
        Effect.provide(
          createTestLayer({
            rateLimiterOptions: { shouldExceedLimit: true },
          })
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const failure = Cause.failureOption(result.cause)
      expect(Option.isSome(failure)).toBe(true)
      if (Option.isSome(failure)) {
        expect((failure.value as { _tag?: string })._tag).toBe(
          'RateLimitExceededError'
        )
      }
    }
  })

  it('should generate new access token with user claims', async () => {
    // Verify the access token is generated for the correct user
    const result = await Effect.runPromise(
      refreshToken({ refreshToken: 'valid-refresh-token' }).pipe(
        Effect.provide(
          createTestLayer({
            jwtOptions: {
              signedToken: 'new-access-token-123',
            },
          })
        )
      )
    )

    expect(result.accessToken).toBe('new-access-token-123')
  })
})
