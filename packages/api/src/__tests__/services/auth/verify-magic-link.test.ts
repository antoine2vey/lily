import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
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
            name: 'Verified User',
            email: 'verified@example.com',
            username: 'verifieduser',
            createdAt: new Date(),
            updatedAt: new Date(),
            role: 'user',
            status: 'active',
          },
        },
      }),
      createMockPgDrizzle(),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

  it('should verify magic link token and return user', async () => {
    const result = await Effect.runPromise(
      verifyMagicLink({ token: 'valid-token' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.token).toBe('verified-token')
    expect(result.user).toBeDefined()
    expect(result.user.id).toBe('user-1')
  })

  it('should return user profile with id', async () => {
    const result = await Effect.runPromise(
      verifyMagicLink({ token: 'valid-token' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.user.id).toBe('user-1')
    expect(result.user.role).toBe('user')
    expect(result.user.status).toBe('active')
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
