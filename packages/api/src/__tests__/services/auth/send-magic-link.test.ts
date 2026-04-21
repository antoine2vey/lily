import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockCommandExecutor } from '@lily/api/__tests__/mocks/command-executor'
import { createMockEmailService } from '@lily/api/__tests__/mocks/email.service'
import {
  clearMagicLinkStore,
  createMockMagicLinkRepository,
  getMagicLinkStore,
} from '@lily/api/__tests__/mocks/magic-link.repository'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import {
  MagicLinkConfig,
  sendMagicLink,
} from '@lily/api/services/auth/endpoints/send-magic-link'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('sendMagicLink', () => {
  afterEach(() => {
    clearMagicLinkStore()
  })

  const createTestLayer = (
    options: {
      shouldExceedRateLimit?: boolean
      disableMagicLink?: boolean
    } = {}
  ) =>
    Layer.mergeAll(
      createMockMagicLinkRepository({ magicLinks: [] }),
      createMockRateLimiterService(
        options.shouldExceedRateLimit !== undefined
          ? { shouldExceedLimit: options.shouldExceedRateLimit }
          : {}
      ),
      createMockCommandExecutor(),
      createMockEmailService(),
      MockAlerterLive,
      Layer.succeed(MagicLinkConfig, {
        disableVerification: options.disableMagicLink ?? false,
      })
    )

  const runWithConfig = <A, E>(effect: Effect.Effect<A, E, never>) =>
    Effect.runPromise(effect)

  const runExitWithConfig = <A, E>(effect: Effect.Effect<A, E, never>) =>
    Effect.runPromiseExit(effect)

  it('should send magic link email successfully', async () => {
    const result = await runWithConfig(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.message).toBe(
      'If an account exists, a magic link has been sent.'
    )
    expect(result.instantCode).toBeUndefined()
  })

  it('should normalize email (lowercase, trim)', async () => {
    await runWithConfig(
      sendMagicLink({ email: '  TEST@EXAMPLE.COM  ' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.email).toBe('test@example.com')
  })

  it('should fail with invalid email format', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'not-an-email' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with empty email', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: '' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when rate limit exceeded', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer({ shouldExceedRateLimit: true }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should delete existing magic links before creating new', async () => {
    // First request creates a magic link
    await runWithConfig(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(getMagicLinkStore()).toHaveLength(1)
    const firstToken = getMagicLinkStore()[0]?.token

    // Second request should delete the first and create new
    await runWithConfig(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockMagicLinkRepository({
              magicLinks: getMagicLinkStore(),
            }),
            createMockRateLimiterService(),
            createMockCommandExecutor(),
            createMockEmailService(),
            MockAlerterLive,
            Layer.succeed(MagicLinkConfig, {
              disableVerification: false,
            })
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

    await runWithConfig(
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
    const result = await runWithConfig(
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
    await runWithConfig(
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

  describe('when DISABLE_MAGIC_LINK_VERIFICATION is enabled', () => {
    it('should return instantCode for immediate verification', async () => {
      const result = await runWithConfig(
        sendMagicLink({ email: 'test@example.com' }).pipe(
          Effect.provide(createTestLayer({ disableMagicLink: true }))
        )
      )

      expect(result.message).toBe(
        'If an account exists, a magic link has been sent.'
      )
      expect(result.instantCode).toBeDefined()

      // Verify the instantCode matches the stored token
      const store = getMagicLinkStore()
      expect(store).toHaveLength(1)
      expect(result.instantCode).toBe(store[0]?.token)
    })

    it('should still validate email format when instant login is enabled', async () => {
      const result = await runExitWithConfig(
        sendMagicLink({ email: 'not-an-email' }).pipe(
          Effect.provide(createTestLayer({ disableMagicLink: true }))
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should still check rate limits when instant login is enabled', async () => {
      const result = await runExitWithConfig(
        sendMagicLink({ email: 'test@example.com' }).pipe(
          Effect.provide(
            createTestLayer({
              shouldExceedRateLimit: true,
              disableMagicLink: true,
            })
          )
        )
      )

      expect(result._tag).toBe('Failure')
    })
  })

  it('should fail with email containing only spaces', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: '   ' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with email missing domain', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'user@' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with email missing local part', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: '@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should normalize uppercase email to lowercase', async () => {
    await runWithConfig(
      sendMagicLink({ email: 'USER@EXAMPLE.COM' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.email).toBe('user@example.com')
  })
})
