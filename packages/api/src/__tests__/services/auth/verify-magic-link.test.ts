import {
  mockExpiredMagicLink,
  mockMagicLink,
  mockUsedMagicLink,
} from '@lily/api/__tests__/fixtures/magic-links'
import {
  mockSuspendedUser,
  mockUsers,
} from '@lily/api/__tests__/fixtures/users'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import {
  clearMagicLinkStore,
  createMockMagicLinkRepository,
} from '@lily/api/__tests__/mocks/magic-link.repository'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import {
  clearRefreshTokenStore,
  createMockRefreshTokenRepository,
} from '@lily/api/__tests__/mocks/refresh-token.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { verifyMagicLink } from '@lily/api/services/auth/endpoints/verify-magic-link'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('verifyMagicLink', () => {
  afterEach(() => {
    clearMagicLinkStore()
    clearRefreshTokenStore()
  })

  const createTestLayer = (
    options: {
      magicLinks?: (typeof mockMagicLink)[]
      users?: typeof mockUsers
      shouldExceedRateLimit?: boolean
      jwtOptions?: Parameters<typeof createMockJWTService>[0]
    } = {}
  ) =>
    Layer.mergeAll(
      createMockMagicLinkRepository({
        magicLinks: options.magicLinks ?? [mockMagicLink],
      }),
      createMockRefreshTokenRepository({ tokens: [] }),
      createMockUserRepository(options.users ?? mockUsers),
      createMockJWTService(options.jwtOptions ?? {}),
      createMockRateLimiterService(
        options.shouldExceedRateLimit !== undefined
          ? { shouldExceedLimit: options.shouldExceedRateLimit }
          : {}
      ),
      createMockPgDrizzle()
    )

  it('should verify valid magic link and return tokens', async () => {
    const result = await Effect.runPromise(
      verifyMagicLink({ code: mockMagicLink.token }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()
    expect(result.expiresIn).toBe(15 * 60) // 15 minutes in seconds
    expect(result.user).toBeDefined()
  })

  it('should fail with invalid code format (not UUID)', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: 'not-a-uuid' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with short code', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: '12345' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when rate limit exceeded', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: mockMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ shouldExceedRateLimit: true }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with expired magic link', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: mockExpiredMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [mockExpiredMagicLink] }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with already used magic link', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: mockUsedMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [mockUsedMagicLink] }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with non-existent magic link', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({
        code: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      }).pipe(Effect.provide(createTestLayer({ magicLinks: [] })))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return existing user if exists', async () => {
    // Create a magic link for existing user
    const existingUserMagicLink = {
      ...mockMagicLink,
      email: mockUsers[0]!.email,
    }

    const result = await Effect.runPromise(
      verifyMagicLink({ code: existingUserMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [existingUserMagicLink] }))
      )
    )

    expect(result.user.email).toBe(mockUsers[0]!.email)
  })

  it('should fail for suspended user', async () => {
    const suspendedUserMagicLink = {
      ...mockMagicLink,
      email: mockSuspendedUser.email,
    }

    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: suspendedUserMagicLink.token }).pipe(
        Effect.provide(
          createTestLayer({
            magicLinks: [suspendedUserMagicLink],
            users: [mockSuspendedUser],
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail for banned user', async () => {
    const bannedUser = {
      ...mockUsers[0]!,
      id: 'user-banned',
      email: 'banned@example.com',
      status: 'banned' as const,
    }
    const bannedUserMagicLink = {
      ...mockMagicLink,
      email: bannedUser.email,
    }

    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: bannedUserMagicLink.token }).pipe(
        Effect.provide(
          createTestLayer({
            magicLinks: [bannedUserMagicLink],
            users: [bannedUser],
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should include user profile in response', async () => {
    const existingUserMagicLink = {
      ...mockMagicLink,
      email: mockUsers[0]!.email,
    }

    const result = await Effect.runPromise(
      verifyMagicLink({ code: existingUserMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [existingUserMagicLink] }))
      )
    )

    expect(result.user.id).toBeDefined()
    expect(result.user.email).toBe(mockUsers[0]!.email)
    expect(result.user.role).toBeDefined()
    expect(result.user.status).toBeDefined()
  })
})
