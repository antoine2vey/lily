import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { verifyMagicLink } from '@lily/api/services/auth/endpoints/verify-magic-link'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('verifyMagicLink', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockAuth({
        verifyResponse: {
          token: 'verified-token',
          user: {
            id: 'user-1',
            email: 'verified@example.com',
            username: 'verifieduser',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      }),
      createMockPgDrizzle(),
      createMockHttpServerRequest()
    )

  it('should verify magic link token and return user', async () => {
    const result = await Effect.runPromise(
      verifyMagicLink({ token: 'valid-token' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.token).toBe('verified-token')
    expect(result.user).toBeDefined()
    expect(result.user.email).toBe('verified@example.com')
  })

  it('should return user profile with id', async () => {
    const result = await Effect.runPromise(
      verifyMagicLink({ token: 'valid-token' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.user.id).toBe('user-1')
    expect(result.user.username).toBe('verifieduser')
  })

  it('should return session token', async () => {
    const result = await Effect.runPromise(
      verifyMagicLink({ token: 'valid-token' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.token).toBeDefined()
    expect(typeof result.token).toBe('string')
  })
})
