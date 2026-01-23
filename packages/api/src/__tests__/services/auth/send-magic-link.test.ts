import { createMockCommandExecutor } from '@lily/api/__tests__/mocks/command-executor'
import {
  clearMagicLinkStore,
  createMockMagicLinkRepository,
  getMagicLinkStore,
} from '@lily/api/__tests__/mocks/magic-link.repository'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { sendMagicLink } from '@lily/api/services/auth/endpoints/send-magic-link'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('sendMagicLink', () => {
  afterEach(() => {
    clearMagicLinkStore()
  })

  const createTestLayer = (options: { shouldExceedRateLimit?: boolean } = {}) =>
    Layer.mergeAll(
      createMockMagicLinkRepository({ magicLinks: [] }),
      createMockRateLimiterService(
        options.shouldExceedRateLimit !== undefined
          ? { shouldExceedLimit: options.shouldExceedRateLimit }
          : {}
      ),
      createMockCommandExecutor()
    )

  it('should send magic link email successfully', async () => {
    const result = await Effect.runPromise(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.message).toBe(
      'If an account exists, a magic link has been sent.'
    )
  })

  it('should normalize email (lowercase, trim)', async () => {
    await Effect.runPromise(
      sendMagicLink({ email: '  TEST@EXAMPLE.COM  ' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.email).toBe('test@example.com')
  })

  it('should fail with invalid email format', async () => {
    const result = await Effect.runPromiseExit(
      sendMagicLink({ email: 'not-an-email' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with empty email', async () => {
    const result = await Effect.runPromiseExit(
      sendMagicLink({ email: '' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when rate limit exceeded', async () => {
    const result = await Effect.runPromiseExit(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer({ shouldExceedRateLimit: true }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should delete existing magic links before creating new', async () => {
    // First request creates a magic link
    await Effect.runPromise(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(getMagicLinkStore()).toHaveLength(1)
    const firstToken = getMagicLinkStore()[0]?.token

    // Second request should delete the first and create new
    await Effect.runPromise(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockMagicLinkRepository({ magicLinks: getMagicLinkStore() }),
            createMockRateLimiterService(),
            createMockCommandExecutor()
          )
        )
      )
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.token).not.toBe(firstToken)
  })

  it('should create magic link with 10-minute expiry', async () => {
    const beforeRequest = Date.now()

    await Effect.runPromise(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)

    const expiresAt = store[0]?.expiresAt?.getTime()
    const expectedExpiry = beforeRequest + 10 * 60 * 1000 // 10 minutes

    // Allow 1 second tolerance
    expect(expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000)
    expect(expiresAt).toBeLessThanOrEqual(expectedExpiry + 2000)
  })

  it('should return generic success message (no user enumeration)', async () => {
    const result = await Effect.runPromise(
      sendMagicLink({ email: 'nonexistent@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // Should return same message regardless of whether user exists
    expect(result.message).toBe(
      'If an account exists, a magic link has been sent.'
    )
  })

  it('should create magic link with valid UUID token', async () => {
    await Effect.runPromise(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const store = getMagicLinkStore()
    const token = store[0]?.token

    // UUID v4 format validation
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(token).toMatch(uuidRegex)
  })
})
