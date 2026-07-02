import {
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
import { Array, Cause, Effect, Exit, Layer, Option } from 'effect'
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

  it('should honor a token rotated within the grace window', async () => {
    // Simulates a concurrent refresh: the token was revoked seconds ago by
    // another request from the same device
    const justRotatedToken = {
      ...mockRevokedRefreshToken,
      revokedAt: new Date(Date.now() - 5 * 1000),
    }

    const result = await Effect.runPromise(
      refreshToken({ refreshToken: 'just-rotated-token' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [justRotatedToken],
            jwtOptions: {
              refreshTokenHash: justRotatedToken.tokenHash,
            },
          })
        )
      )
    )

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()
  })

  it('should keep the original revocation time on grace-window reuse', async () => {
    const revokedAt = new Date(Date.now() - 5 * 1000)
    const justRotatedToken = {
      ...mockRevokedRefreshToken,
      revokedAt,
    }

    await Effect.runPromise(
      refreshToken({ refreshToken: 'just-rotated-token' }).pipe(
        Effect.provide(
          createTestLayer({
            tokens: [justRotatedToken],
            jwtOptions: {
              refreshTokenHash: justRotatedToken.tokenHash,
            },
          })
        )
      )
    )

    const stored = Option.getOrNull(
      Array.findFirst(
        getRefreshTokenStore(),
        (t) => t.id === justRotatedToken.id
      )
    )
    expect(stored?.revokedAt).toEqual(revokedAt)
  })

  it('should fail with a token rotated before the grace window', async () => {
    // mockRevokedRefreshToken was revoked 1 hour ago — far outside grace
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

  it('should propagate RateLimitExceededError when throttled', async () => {
    const result = await Effect.runPromiseExit(
      refreshToken({ refreshToken: 'valid-refresh-token' }).pipe(
        Effect.provide(
          createTestLayer({
            rateLimiterOptions: { shouldExceedLimit: true },
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
    const failure = Exit.isFailure(result)
      ? Option.getOrNull(Cause.failureOption(result.cause))
      : null
    expect(failure).toMatchObject({ _tag: 'RateLimitExceededError' })
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
