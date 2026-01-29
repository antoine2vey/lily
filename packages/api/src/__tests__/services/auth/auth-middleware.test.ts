import {
  mockAdminUser,
  mockSuspendedUser,
  mockUsers,
} from '@lily/api/__tests__/fixtures/users'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { Unauthorized } from '@lily/api/services/auth/middleware.types'
import { validateUserFromToken } from '@lily/api/services/auth/user-validator'
import type { User } from '@lily/shared'
import { Effect, Exit, Layer, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'

describe('Authentication Middleware (validateUserFromToken)', () => {
  const createTestLayer = (options: {
    jwtOptions?: Parameters<typeof createMockJWTService>[0]
    users?: User[]
  }) =>
    Layer.mergeAll(
      createMockJWTService(options.jwtOptions),
      createMockUserRepository(options.users ?? mockUsers)
    )

  const createError = (message: string) => new Unauthorized({ message })

  it('should successfully authenticate with valid token', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        verifyResult: {
          sub: 'user-1',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
        },
      },
      users: mockUsers,
    })

    const result = await Effect.runPromise(
      validateUserFromToken({
        token: Redacted.make('valid-token'),
        createError,
      }).pipe(Effect.provide(layer))
    )

    expect(result.profile.id).toBe('user-1')
    expect(result.profile.email).toBe('test@example.com')
    expect(result.user).toBeDefined()
  })

  it('should fail with Unauthorized for invalid token', async () => {
    const layer = createTestLayer({
      jwtOptions: { shouldFailVerify: true },
      users: mockUsers,
    })

    const result = await Effect.runPromiseExit(
      validateUserFromToken({
        token: Redacted.make('invalid-token'),
        createError,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should fail with Unauthorized when user not found', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        verifyResult: {
          sub: 'non-existent-user',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
        },
      },
      users: mockUsers,
    })

    const result = await Effect.runPromiseExit(
      validateUserFromToken({
        token: Redacted.make('valid-token'),
        createError,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = result.cause
      expect(error).toBeDefined()
    }
  })

  it('should fail when user status is not active', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        verifyResult: {
          sub: 'user-1',
          email: 'test@example.com',
          role: 'user',
          status: 'suspended',
        },
      },
      users: mockUsers,
    })

    const result = await Effect.runPromiseExit(
      validateUserFromToken({
        token: Redacted.make('valid-token'),
        createError,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should fail for expired token', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        shouldFailVerify: true,
        verifyErrorCode: 'EXPIRED_TOKEN',
      },
      users: mockUsers,
    })

    const result = await Effect.runPromiseExit(
      validateUserFromToken({
        token: Redacted.make('expired-token'),
        createError,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should require admin role when requireAdmin is true', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        verifyResult: {
          sub: 'user-1',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
        },
      },
      users: mockUsers,
    })

    const result = await Effect.runPromiseExit(
      validateUserFromToken({
        token: Redacted.make('valid-token'),
        createError,
        requireAdmin: true,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should allow admin when requireAdmin is true and user is admin', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        verifyResult: {
          sub: 'admin-1',
          email: 'admin@example.com',
          role: 'admin',
          status: 'active',
        },
      },
      users: [mockAdminUser],
    })

    const result = await Effect.runPromise(
      validateUserFromToken({
        token: Redacted.make('valid-token'),
        createError,
        requireAdmin: true,
      }).pipe(Effect.provide(layer))
    )

    expect(result.profile.id).toBe('admin-1')
    expect(result.profile.role).toBe('admin')
  })

  it('should build correct user profile from database user', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        verifyResult: {
          sub: 'user-1',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
        },
      },
      users: mockUsers,
    })

    const result = await Effect.runPromise(
      validateUserFromToken({
        token: Redacted.make('valid-token'),
        createError,
      }).pipe(Effect.provide(layer))
    )

    expect(result.profile).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      role: expect.any(String),
      status: expect.any(String),
    })
  })

  it('should fail when database user status differs from JWT', async () => {
    const layer = createTestLayer({
      jwtOptions: {
        verifyResult: {
          sub: 'user-suspended',
          email: 'suspended@example.com',
          role: 'user',
          status: 'active', // JWT says active
        },
      },
      users: [mockSuspendedUser], // But DB says suspended
    })

    const result = await Effect.runPromiseExit(
      validateUserFromToken({
        token: Redacted.make('valid-token'),
        createError,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
