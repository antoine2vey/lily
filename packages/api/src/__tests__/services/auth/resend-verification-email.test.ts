import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { resendVerificationEmail } from '@lily/api/services/auth/endpoints/resend-verification-email'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('resendVerificationEmail', () => {
  const createTestLayer = (options = {}) =>
    Layer.mergeAll(createMockAuth(options), createMockHttpServerRequest())

  it('should send verification email and return success message', async () => {
    const result = await Effect.runPromise(
      resendVerificationEmail({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.message).toBe('Verification email sent')
  })

  it('should fail with invalid email format', async () => {
    const result = await Effect.runPromiseExit(
      resendVerificationEmail({ email: 'invalid-email' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = result.cause._tag === 'Fail' ? result.cause.error : null
      expect(error).toHaveProperty('error', 'Invalid email format')
    }
  })

  it('should fail with empty email', async () => {
    const result = await Effect.runPromiseExit(
      resendVerificationEmail({ email: '' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should handle API errors gracefully', async () => {
    const result = await Effect.runPromiseExit(
      resendVerificationEmail({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer({ sendVerificationEmailError: true }))
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = result.cause._tag === 'Fail' ? result.cause.error : null
      expect(error).toHaveProperty('error', 'Failed to send verification email')
    }
  })

  it('should validate various valid email formats', async () => {
    const validEmails = [
      'user@example.com',
      'user.name@example.com',
      'user+tag@example.org',
      'user@subdomain.example.com',
    ]

    for (const email of validEmails) {
      const result = await Effect.runPromise(
        resendVerificationEmail({ email }).pipe(
          Effect.provide(createTestLayer())
        )
      )
      expect(result.message).toBe('Verification email sent')
    }
  })
})
