import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEmailService } from '@lily/api/__tests__/mocks/email.service'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import {
  clearMagicLinkStore,
  createMockMagicLinkRepository,
  getMagicLinkStore,
} from '@lily/api/__tests__/mocks/magic-link.repository'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockRefreshTokenRepository } from '@lily/api/__tests__/mocks/refresh-token.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  MagicLinkConfig,
  sendMagicLink,
} from '@lily/api/services/auth/endpoints/send-magic-link'
import { verifyMagicLink } from '@lily/api/services/auth/endpoints/verify-magic-link'
import { RATE_LIMITS } from '@lily/api/services/rate-limiter/service'
import { AuthError } from '@lily/shared'
import { Effect, Exit, Layer, Option } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('sendMagicLink', () => {
  afterEach(() => {
    clearMagicLinkStore()
  })

  const createTestLayer = (
    options: {
      shouldExceedRateLimit?: boolean
      disableMagicLink?: boolean
      reviewerEmails?: ReadonlyArray<string>
      emailFails?: boolean
    } = {}
  ) =>
    Layer.mergeAll(
      createMockMagicLinkRepository({ magicLinks: [] }),
      createMockRateLimiterService(
        options.shouldExceedRateLimit !== undefined
          ? { shouldExceedLimit: options.shouldExceedRateLimit }
          : {}
      ),
      createMockEmailService({ shouldFail: options.emailFails ?? false }),
      MockAlerterLive,
      Layer.succeed(MagicLinkConfig, {
        disableVerification: options.disableMagicLink ?? false,
        reviewerEmails: options.reviewerEmails ?? [],
      })
    )

  const runWithConfig = <A, E>(effect: Effect.Effect<A, E, never>) =>
    Effect.runPromise(effect)

  const runExitWithConfig = <A, E>(effect: Effect.Effect<A, E, never>) =>
    Effect.runPromiseExit(effect)

  const fromIp = (ip: string) => ({ 'x-real-ip': ip })

  it('should send magic link email successfully', async () => {
    const result = await runWithConfig(
      sendMagicLink({ email: 'test@example.com' }, {}).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.message).toBe(
      'If an account exists, a magic link has been sent.'
    )
    expect(result.instantCode).toBeUndefined()
  })

  it('should fail instead of reporting success when the email is not sent', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'test@example.com' }, {}).pipe(
        Effect.provide(createTestLayer({ emailFails: true }))
      )
    )

    expect(Exit.findErrorOption(result)).toEqual(
      Option.some(
        new AuthError({
          message: "We couldn't send the sign-in email. Please try again.",
        })
      )
    )
  })

  it('should word the send failure in the requested language', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'test@example.com', language: 'fr' }, {}).pipe(
        Effect.provide(createTestLayer({ emailFails: true }))
      )
    )

    expect(Exit.findErrorOption(result)).toEqual(
      Option.some(
        new AuthError({
          message:
            "Impossible d'envoyer l'e-mail de connexion. Veuillez réessayer.",
        })
      )
    )
  })

  it('should normalize email (lowercase, trim)', async () => {
    await runWithConfig(
      sendMagicLink({ email: '  TEST@EXAMPLE.COM  ' }, {}).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.email).toBe('test@example.com')
  })

  it('should fail with invalid email format', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'not-an-email' }, {}).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with empty email', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: '' }, {}).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when rate limit exceeded', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'test@example.com' }, {}).pipe(
        Effect.provide(createTestLayer({ shouldExceedRateLimit: true }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('keeps an earlier link valid when a new one is requested', async () => {
    const layer = createTestLayer()
    await runWithConfig(
      sendMagicLink({ email: 'test@example.com' }, fromIp('203.0.113.1')).pipe(
        Effect.provide(layer)
      )
    )
    const firstToken = getMagicLinkStore()[0]?.token ?? ''

    await runWithConfig(
      sendMagicLink({ email: 'test@example.com' }, fromIp('198.51.100.7')).pipe(
        Effect.provide(layer)
      )
    )

    const verified = await runWithConfig(
      verifyMagicLink({ code: firstToken }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockMagicLinkRepository({ magicLinks: getMagicLinkStore() }),
            createMockRefreshTokenRepository({ tokens: [] }),
            createMockUserRepository(mockUsers),
            createMockJWTService({}),
            createMockRateLimiterService(),
            createMockPgDrizzle()
          )
        )
      )
    )
    expect(verified.user.email).toBe('test@example.com')
  })

  describe('per-client-IP limit', () => {
    it('rejects a client IP over its hourly limit without spending the address quota', async () => {
      const layer = createTestLayer()
      const attacker = fromIp('203.0.113.1')

      for (let i = 0; i < RATE_LIMITS.MAGIC_LINK_PER_IP.maxRequests; i++) {
        await runWithConfig(
          sendMagicLink({ email: `user${i}@example.com` }, attacker).pipe(
            Effect.provide(layer)
          )
        )
      }

      const fromAttacker = await runExitWithConfig(
        sendMagicLink({ email: 'victim@example.com' }, attacker).pipe(
          Effect.provide(layer)
        )
      )
      expect(
        Exit.findErrorOption(fromAttacker).pipe(Option.map((e) => e._tag))
      ).toEqual(Option.some('RateLimitExceededError'))

      const fromOwner = await runExitWithConfig(
        sendMagicLink(
          { email: 'victim@example.com' },
          fromIp('198.51.100.7')
        ).pipe(Effect.provide(layer))
      )
      expect(Exit.isSuccess(fromOwner)).toBe(true)
    })
  })

  describe('per-address hourly cap', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('stops sending to one address after the hourly cap, across client IPs', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const layer = createTestLayer()
      const { maxRequests } = RATE_LIMITS.MAGIC_LINK_HOURLY
      const perMinute = RATE_LIMITS.MAGIC_LINK.maxRequests

      const outcomes: Array<boolean> = []
      for (let i = 0; i <= maxRequests; i++) {
        if (i > 0 && i % perMinute === 0) vi.advanceTimersByTime(61_000)
        const exit = await runExitWithConfig(
          sendMagicLink(
            { email: 'victim@example.com' },
            fromIp(`198.51.100.${i}`)
          ).pipe(Effect.provide(layer))
        )
        outcomes.push(Exit.isSuccess(exit))
      }

      expect(outcomes.slice(0, maxRequests).every(Boolean)).toBe(true)
      expect(outcomes[maxRequests]).toBe(false)
      expect(getMagicLinkStore()).toHaveLength(maxRequests)
    })
  })

  it('should create magic link with 10-minute expiry', async () => {
    const beforeRequest = Date.now()

    await runWithConfig(
      sendMagicLink({ email: 'test@example.com' }, {}).pipe(
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
      sendMagicLink({ email: 'nonexistent@example.com' }, {}).pipe(
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
      sendMagicLink({ email: 'test@example.com' }, {}).pipe(
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
        sendMagicLink({ email: 'test@example.com' }, {}).pipe(
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
        sendMagicLink({ email: 'not-an-email' }, {}).pipe(
          Effect.provide(createTestLayer({ disableMagicLink: true }))
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should still check rate limits when instant login is enabled', async () => {
      const result = await runExitWithConfig(
        sendMagicLink({ email: 'test@example.com' }, {}).pipe(
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

  describe('reviewer email allowlist', () => {
    it('should return instantCode for an allowlisted reviewer email', async () => {
      const result = await runWithConfig(
        sendMagicLink({ email: 'apple-reviewer@withlily.app' }, {}).pipe(
          Effect.provide(
            createTestLayer({
              reviewerEmails: ['apple-reviewer@withlily.app'],
            })
          )
        )
      )

      expect(result.instantCode).toBeDefined()
      const store = getMagicLinkStore()
      expect(result.instantCode).toBe(store[0]?.token)
    })

    it('should not return instantCode for a non-allowlisted email', async () => {
      const result = await runWithConfig(
        sendMagicLink({ email: 'random@example.com' }, {}).pipe(
          Effect.provide(
            createTestLayer({
              reviewerEmails: ['apple-reviewer@withlily.app'],
            })
          )
        )
      )

      expect(result.instantCode).toBeUndefined()
    })

    it('should match allowlist case- and whitespace-insensitively', async () => {
      const result = await runWithConfig(
        sendMagicLink({ email: '  APPLE-REVIEWER@WITHLILY.APP  ' }, {}).pipe(
          Effect.provide(
            createTestLayer({
              reviewerEmails: ['apple-reviewer@withlily.app'],
            })
          )
        )
      )

      expect(result.instantCode).toBeDefined()
    })

    it('should not bypass when allowlist is empty', async () => {
      const result = await runWithConfig(
        sendMagicLink({ email: 'apple-reviewer@withlily.app' }, {}).pipe(
          Effect.provide(createTestLayer({ reviewerEmails: [] }))
        )
      )

      expect(result.instantCode).toBeUndefined()
    })

    it('should still enforce rate limits for reviewer emails', async () => {
      const result = await runExitWithConfig(
        sendMagicLink({ email: 'apple-reviewer@withlily.app' }, {}).pipe(
          Effect.provide(
            createTestLayer({
              reviewerEmails: ['apple-reviewer@withlily.app'],
              shouldExceedRateLimit: true,
            })
          )
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should still validate email format for reviewer-pattern strings', async () => {
      const result = await runExitWithConfig(
        sendMagicLink({ email: 'not-an-email' }, {}).pipe(
          Effect.provide(createTestLayer({ reviewerEmails: ['not-an-email'] }))
        )
      )

      expect(result._tag).toBe('Failure')
    })
  })

  it('should fail with email containing only spaces', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: '   ' }, {}).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with email missing domain', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: 'user@' }, {}).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with email missing local part', async () => {
    const result = await runExitWithConfig(
      sendMagicLink({ email: '@example.com' }, {}).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should normalize uppercase email to lowercase', async () => {
    await runWithConfig(
      sendMagicLink({ email: 'USER@EXAMPLE.COM' }, {}).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const store = getMagicLinkStore()
    expect(store).toHaveLength(1)
    expect(store[0]?.email).toBe('user@example.com')
  })
})
