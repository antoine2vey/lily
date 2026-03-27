import { sendInternalMagicLink } from '@lily/api/services/internal/endpoints/send-magic-link'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { mockUser1, mockUsers } from '../../fixtures/users'
import { createMockEmailService } from '../../mocks/email.service'
import {
  clearMagicLinkStore,
  createMockMagicLinkRepository,
  getMagicLinkStore,
} from '../../mocks/magic-link.repository'
import { createMockRateLimiterService } from '../../mocks/rate-limiter.service'
import { createMockUserRepository } from '../../mocks/user.repository'

describe('sendInternalMagicLink', () => {
  afterEach(() => {
    clearMagicLinkStore()
  })

  const createTestLayer = (
    options: { users?: typeof mockUsers; shouldExceedRateLimit?: boolean } = {}
  ) =>
    Layer.mergeAll(
      createMockMagicLinkRepository({ magicLinks: [] }),
      createMockUserRepository(options.users ?? mockUsers),
      createMockRateLimiterService(
        options.shouldExceedRateLimit !== undefined
          ? { shouldExceedLimit: options.shouldExceedRateLimit }
          : {}
      ),
      createMockEmailService()
    )

  it('should return success for existing user', async () => {
    const result = await Effect.runPromise(
      sendInternalMagicLink({
        email: mockUser1.email,
        callbackUrl: 'https://example.com/callback',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.message).toBe('Magic link sent')
  })

  it('should silently succeed for unknown email', async () => {
    const result = await Effect.runPromise(
      sendInternalMagicLink({
        email: 'unknown@example.com',
        callbackUrl: 'https://example.com/callback',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.message).toBe('Magic link sent')

    // No magic link should be created for unknown email
    const store = getMagicLinkStore()
    expect(store).toHaveLength(0)
  })

  it('should fail with invalid email format', async () => {
    const exit = await Effect.runPromiseExit(
      sendInternalMagicLink({
        email: 'not-an-email',
        callbackUrl: 'https://example.com/callback',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(exit._tag).toBe('Failure')
  })

  it('should fail when rate limited', async () => {
    const exit = await Effect.runPromiseExit(
      sendInternalMagicLink({
        email: mockUser1.email,
        callbackUrl: 'https://example.com/callback',
      }).pipe(Effect.provide(createTestLayer({ shouldExceedRateLimit: true })))
    )

    expect(exit._tag).toBe('Failure')
  })

  it('should create magic link token for existing user', async () => {
    await Effect.runPromise(
      sendInternalMagicLink({
        email: mockUser1.email,
        callbackUrl: 'https://example.com/callback',
      }).pipe(Effect.provide(createTestLayer()))
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.email).toBe(mockUser1.email)
  })
})
