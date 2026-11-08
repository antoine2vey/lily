import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { AuthError } from '@lily/shared'
import {
  DateTime,
  Duration,
  Effect,
  String as EffectString,
  pipe,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// 10 minutes expiry
export const MAGIC_LINK_EXPIRY_MS = 10 * 60 * 1000

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizeEmail = (email: string) =>
  pipe(email, EffectString.toLowerCase, EffectString.trim)

export const validateEmail = (email: string): Effect.Effect<void, AuthError> =>
  EMAIL_REGEX.test(email) && email.length <= 254
    ? Effect.void
    : Effect.fail(new AuthError({ message: 'Invalid email format' }))

/** The per-address limits every magic-link sender shares. */
export const checkMagicLinkEmailLimits = (
  normalizedEmail: string
): Effect.Effect<void, RateLimitExceededError, RateLimiterService> =>
  Effect.gen(function* () {
    const rateLimiter = yield* RateLimiterService
    yield* rateLimiter.checkRateLimit(
      `magic-link:${normalizedEmail}`,
      RATE_LIMITS.MAGIC_LINK
    )
    yield* rateLimiter.checkRateLimit(
      `magic-link-hourly:${normalizedEmail}`,
      RATE_LIMITS.MAGIC_LINK_HOURLY
    )
  })

export const createMagicLinkToken = (
  normalizedEmail: string
): Effect.Effect<
  { token: string; expiresAt: Date },
  SqlError,
  MagicLinkRepository
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository

    // Live links stay valid: each is a single-use random UUID that expires
    // in 10 minutes, and a new request must not void one the owner holds.
    yield* magicLinkRepo.deleteSpentByEmail(normalizedEmail)

    // Generate secure token
    const token = crypto.randomUUID()
    const expiresAt = DateTime.toDateUtc(
      DateTime.addDuration(
        DateTime.nowUnsafe(),
        Duration.millis(MAGIC_LINK_EXPIRY_MS)
      )
    )

    // Store magic link in database
    yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)

    return { token, expiresAt }
  })
