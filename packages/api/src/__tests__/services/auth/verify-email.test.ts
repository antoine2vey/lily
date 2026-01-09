import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import {
  createMockAuth,
  createMockHttpServerRequest,
  type MockAuthOptions,
} from '@lily/api/__tests__/mocks/auth'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { verifyEmail } from '@lily/api/services/auth/endpoints/verify-email'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('verifyEmail', () => {
  const createTestLayer = (options: MockAuthOptions = {}) =>
    Layer.mergeAll(
      createMockAuth(options),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

  it('should verify email and return user with verified status', async () => {
    const result = await Effect.runPromise(
      verifyEmail({ token: 'valid-token-123' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.verified).toBe(true)
    expect(result.user).toBeDefined()
    expect(result.user.id).toBe('user-1')
    expect(result.user.email).toBe('test@example.com')
    expect(result.user.role).toBe('user')
    expect(result.user.status).toBe('active')
  })

  it('should fail with empty token', async () => {
    const result = await Effect.runPromiseExit(
      verifyEmail({ token: '' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = result.cause._tag === 'Fail' ? result.cause.error : null
      expect(error).toHaveProperty('error', 'Token is required')
    }
  })

  it('should fail with invalid/expired token', async () => {
    const result = await Effect.runPromiseExit(
      verifyEmail({ token: 'invalid-token' }).pipe(
        Effect.provide(createTestLayer({ verifyEmailError: true }))
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = result.cause._tag === 'Fail' ? result.cause.error : null
      expect(error).toHaveProperty(
        'error',
        'Invalid or expired verification token'
      )
    }
  })

  it('should fail when user is not found in response', async () => {
    const result = await Effect.runPromiseExit(
      verifyEmail({ token: 'valid-token' }).pipe(
        Effect.provide(createTestLayer({ verifyEmailResponse: { user: null } }))
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = result.cause._tag === 'Fail' ? result.cause.error : null
      expect(error).toHaveProperty(
        'error',
        'Invalid or expired verification token'
      )
    }
  })

  it('should return correct user data on successful verification', async () => {
    const mockUser = {
      id: 'user-1',
      name: 'Custom User',
      email: 'custom@example.com',
      username: 'customuser',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      role: 'user' as const,
      status: 'active' as const,
    }

    const result = await Effect.runPromise(
      verifyEmail({ token: 'valid-token' }).pipe(
        Effect.provide(
          createTestLayer({ verifyEmailResponse: { user: mockUser } })
        )
      )
    )

    expect(result.verified).toBe(true)
    expect(result.user.id).toBe('user-1')
    expect(result.user.role).toBe('user')
    expect(result.user.status).toBe('active')
  })
})
