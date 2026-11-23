import {
  mockExpiredMagicLink,
  mockMagicLink,
  mockUsedMagicLink,
} from '@lily/api/__tests__/fixtures/magic-links'
import {
  mockSuspendedUser,
  mockUser1,
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
import {
  type CreateUserData,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import { verifyMagicLink } from '@lily/api/services/auth/endpoints/verify-magic-link'
import { failureOf } from '@lily/shared/testing'
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
      userRepository?: Layer.Layer<UserRepository>
      shouldExceedRateLimit?: boolean
      jwtOptions?: Parameters<typeof createMockJWTService>[0]
    } = {}
  ) =>
    Layer.mergeAll(
      createMockMagicLinkRepository({
        magicLinks: options.magicLinks ?? [mockMagicLink],
      }),
      createMockRefreshTokenRepository({ tokens: [] }),
      options.userRepository ??
        createMockUserRepository(options.users ?? mockUsers),
      createMockJWTService(options.jwtOptions ?? {}),
      createMockRateLimiterService(
        options.shouldExceedRateLimit !== undefined
          ? { shouldExceedLimit: options.shouldExceedRateLimit }
          : {}
      ),
      createMockPgDrizzle
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

  const signUpFrom = async (timezone: string) => {
    const created: Array<CreateUserData> = []
    const recordingUsers = Layer.effect(
      UserRepository,
      Effect.map(UserRepository, (repo) => ({
        ...repo,
        create: (data: CreateUserData) => {
          created.push(data)
          return repo.create(data)
        },
      }))
    ).pipe(Layer.provide(createMockUserRepository([])))
    await Effect.runPromise(
      verifyMagicLink({ code: mockMagicLink.token, timezone }).pipe(
        Effect.provide(createTestLayer({ userRepository: recordingUsers }))
      )
    )
    return created
  }

  it('stores the canonical zone of an alias a new device reports', async () => {
    expect(await signUpFrom('Eire')).toMatchObject([
      { timezone: 'Europe/Dublin' },
    ])
  })

  it('stores no zone when the device reports one that does not resolve', async () => {
    const created = await signUpFrom('Not/AZone')

    expect(created).toHaveLength(1)
    expect(created[0]).not.toHaveProperty('timezone')
  })

  it('should fail with invalid code format (not UUID)', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: 'not-a-uuid' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid code format',
    })
  })

  it('should fail with short code', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: '12345' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid code format',
    })
  })

  it('should fail when rate limit exceeded', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: mockMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ shouldExceedRateLimit: true }))
      )
    )

    expect(failureOf(result)._tag).toBe('RateLimitExceededError')
  })

  it('should fail with expired magic link', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: mockExpiredMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [mockExpiredMagicLink] }))
      )
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid or expired code',
    })
  })

  it('should fail with already used magic link', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({ code: mockUsedMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [mockUsedMagicLink] }))
      )
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid or expired code',
    })
  })

  it('should fail with non-existent magic link', async () => {
    const result = await Effect.runPromiseExit(
      verifyMagicLink({
        code: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      }).pipe(Effect.provide(createTestLayer({ magicLinks: [] })))
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid or expired code',
    })
  })

  it('should return existing user if exists', async () => {
    // Create a magic link for existing user
    const existingUserMagicLink = {
      ...mockMagicLink,
      email: mockUser1.email,
    }

    const result = await Effect.runPromise(
      verifyMagicLink({ code: existingUserMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [existingUserMagicLink] }))
      )
    )

    expect(result.user.email).toBe(mockUser1.email)
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

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Account is not active',
    })
  })

  it('should fail for banned user', async () => {
    const bannedUser = {
      ...mockUser1,
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

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Account is not active',
    })
  })

  it('should include user profile in response', async () => {
    const existingUserMagicLink = {
      ...mockMagicLink,
      email: mockUser1.email,
    }

    const result = await Effect.runPromise(
      verifyMagicLink({ code: existingUserMagicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [existingUserMagicLink] }))
      )
    )

    expect(result.user.id).toBeDefined()
    expect(result.user.email).toBe(mockUser1.email)
    expect(result.user.role).toBeDefined()
    expect(result.user.status).toBeDefined()
  })
})
