import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { verifyEmail } from '@lily/api/services/auth/endpoints/verify-email'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('verifyEmail', () => {
  const createTestLayer = (options = {}) =>
    Layer.mergeAll(createMockAuth(options), createMockHttpServerRequest())

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
      id: 'custom-user-id',
      name: 'Custom User',
      email: 'custom@example.com',
      username: 'customuser',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    }

    const result = await Effect.runPromise(
      verifyEmail({ token: 'valid-token' }).pipe(
        Effect.provide(
          createTestLayer({ verifyEmailResponse: { user: mockUser } })
        )
      )
    )

    expect(result.verified).toBe(true)
    expect(result.user.id).toBe('custom-user-id')
    expect(result.user.name).toBe('Custom User')
    expect(result.user.email).toBe('custom@example.com')
  })
})
