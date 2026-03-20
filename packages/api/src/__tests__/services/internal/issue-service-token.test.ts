import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { ACCESS_TOKEN_EXPIRY_SECONDS } from '@lily/api/services/auth/constants'
import { issueServiceToken } from '@lily/api/services/internal/endpoints/issue-service-token'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import {
  mockExpiredMagicLink,
  mockMagicLink,
  mockUsedMagicLink,
} from '../../fixtures/magic-links'
import {
  mockSuspendedUser,
  mockUser1,
  mockUser2,
  mockUsers,
} from '../../fixtures/users'
import { createMockJWTService } from '../../mocks/jwt.service'
import {
  clearMagicLinkStore,
  createMockMagicLinkRepository,
} from '../../mocks/magic-link.repository'
import {
  clearRefreshTokenStore,
  createMockRefreshTokenRepository,
  getRefreshTokenStore,
} from '../../mocks/refresh-token.repository'
import { createMockUserRepository } from '../../mocks/user.repository'

/**
 * Creates a PgDrizzle mock that supports chainable
 * update().set().where().returning() calls, returning
 * an empty array so the source code falls back gracefully.
 */
const createChainablePgDrizzle = (): Layer.Layer<PgDrizzle.PgDrizzle> => {
  const returning = () => Effect.succeed([])
  const where = () => ({ returning })
  const set = () => ({ where })
  const update = () => ({ set })

  return Layer.succeed(PgDrizzle.PgDrizzle, {
    update,
  } as unknown as PgDrizzle.PgDrizzle['Type'])
}

describe('issueServiceToken', () => {
  afterEach(() => {
    clearMagicLinkStore()
    clearRefreshTokenStore()
  })

  const createTestLayer = (
    options: {
      magicLinks?: (typeof mockMagicLink)[]
      users?: typeof mockUsers
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
      createChainablePgDrizzle()
    )

  const expectFailureMessage = (
    exit: Exit.Exit<unknown, { message: string }>,
    message: string
  ) => {
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause)
      expect(Option.isSome(error)).toBe(true)
      if (Option.isSome(error)) {
        expect(error.value.message).toBe(message)
      }
    }
  }

  it('should return JWT and refresh token for valid magic link', async () => {
    const magicLink = {
      ...mockMagicLink,
      email: mockUser1.email,
    }

    const result = await Effect.runPromise(
      issueServiceToken({ magicLinkCode: magicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [magicLink] }))
      )
    )

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()
    expect(result.user.id).toBe(mockUser1.id)
    expect(result.user.email).toBe(mockUser1.email)
  })

  it('should fail with invalid magic link code', async () => {
    const exit = await Effect.runPromiseExit(
      issueServiceToken({ magicLinkCode: 'nonexistent-code' }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [] }))
      )
    )

    expectFailureMessage(exit, 'Invalid or expired magic link')
  })

  it('should fail when magic link is already used', async () => {
    const exit = await Effect.runPromiseExit(
      issueServiceToken({
        magicLinkCode: mockUsedMagicLink.token,
      }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [mockUsedMagicLink] }))
      )
    )

    expectFailureMessage(exit, 'Invalid or expired magic link')
  })

  it('should fail when magic link is expired', async () => {
    const exit = await Effect.runPromiseExit(
      issueServiceToken({
        magicLinkCode: mockExpiredMagicLink.token,
      }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [mockExpiredMagicLink] }))
      )
    )

    expectFailureMessage(exit, 'Invalid or expired magic link')
  })

  it('should fail when email has no matching user', async () => {
    const magicLink = {
      ...mockMagicLink,
      email: 'nobody@example.com',
    }

    const exit = await Effect.runPromiseExit(
      issueServiceToken({ magicLinkCode: magicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [magicLink] }))
      )
    )

    expectFailureMessage(exit, 'No account found for this email')
  })

  it('should fail when user is suspended', async () => {
    const magicLink = {
      ...mockMagicLink,
      email: mockSuspendedUser.email,
    }

    const exit = await Effect.runPromiseExit(
      issueServiceToken({ magicLinkCode: magicLink.token }).pipe(
        Effect.provide(
          createTestLayer({
            magicLinks: [magicLink],
            users: [mockSuspendedUser],
          })
        )
      )
    )

    expectFailureMessage(exit, 'Account is suspended')
  })

  it('should succeed for unverified email user', async () => {
    const magicLink = {
      ...mockMagicLink,
      email: mockUser2.email,
    }

    // mockUser2 has emailVerified: false, which triggers
    // db.update — the PgDrizzle mock is a no-op so the
    // update returns empty array and falls back to existing user
    const result = await Effect.runPromise(
      issueServiceToken({ magicLinkCode: magicLink.token }).pipe(
        Effect.provide(
          createTestLayer({
            magicLinks: [magicLink],
            users: [mockUser2],
          })
        )
      )
    )

    expect(result.accessToken).toBeDefined()
    expect(result.user.email).toBe(mockUser2.email)
  })

  it('should return correct expiresIn value', async () => {
    const magicLink = {
      ...mockMagicLink,
      email: mockUser1.email,
    }

    const result = await Effect.runPromise(
      issueServiceToken({ magicLinkCode: magicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [magicLink] }))
      )
    )

    expect(result.expiresIn).toBe(ACCESS_TOKEN_EXPIRY_SECONDS)
  })

  it('should create a refresh token record', async () => {
    const magicLink = {
      ...mockMagicLink,
      email: mockUser1.email,
    }

    await Effect.runPromise(
      issueServiceToken({ magicLinkCode: magicLink.token }).pipe(
        Effect.provide(createTestLayer({ magicLinks: [magicLink] }))
      )
    )

    const store = getRefreshTokenStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.userId).toBe(mockUser1.id)
  })
})
