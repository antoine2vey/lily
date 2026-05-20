import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import type { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { issueSession } from '@lily/api/services/auth/helpers/issue-session'
import type { JWTService } from '@lily/api/services/jwt/service'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import type { AuthResponse, MagicLinkVerifyRequest } from '@lily/shared/auth'
import { Effect, Option, pipe } from 'effect'

/**
 * Verify magic link token and exchange for JWT tokens
 * This is called by the app after receiving the code from the deep link
 */
export const verifyMagicLink = ({
  code,
  timezone,
  language,
}: MagicLinkVerifyRequest): Effect.Effect<
  AuthResponse,
  { message: string },
  | MagicLinkRepository
  | RefreshTokenRepository
  | UserRepository
  | JWTService
  | RateLimiterService
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository
    const userRepo = yield* UserRepository
    const rateLimiter = yield* RateLimiterService

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(code)) {
      return yield* Effect.fail({ message: 'Invalid code format' })
    }

    // Check rate limit
    yield* rateLimiter.checkRateLimit(`verify:${code}`, RATE_LIMITS.VERIFY)

    // Atomically find valid magic link and mark as used (prevents TOCTOU race)
    const magicLink = yield* magicLinkRepo.findValidAndMarkUsed(code)

    if (!magicLink) {
      return yield* Effect.fail({ message: 'Invalid or expired code' })
    }

    // Find or create user, syncing device fields on login
    const existingUser = yield* userRepo.findByEmail(magicLink.email)

    const user = yield* pipe(
      Option.fromNullable(existingUser),
      Option.match({
        onNone: () =>
          userRepo.create({
            email: magicLink.email,
            emailVerified: true,
            ...(timezone ? { timezone } : {}),
            ...(language ? { language } : {}),
          }),
        onSome: (existing) =>
          Effect.gen(function* () {
            const needsEmailVerify = !existing.emailVerified
            const needsLanguageSync = language && existing.language !== language

            if (!needsEmailVerify && !needsLanguageSync) return existing

            const updated = yield* userRepo.update(existing.id, {
              ...(needsEmailVerify ? { emailVerified: true } : {}),
              ...(needsLanguageSync ? { language } : {}),
            })

            return pipe(
              Option.fromNullable(updated),
              Option.getOrElse(() => existing)
            )
          }),
      })
    )

    if (!user) {
      return yield* Effect.fail({ message: 'Failed to create user' })
    }

    // Check user status
    if (user.status !== 'active') {
      return yield* Effect.fail({
        message: 'Account is not active',
        status: user.status,
      })
    }

    return yield* issueSession(user)
  }).pipe(Effect.withSpan('AuthService.verifyMagicLink'))
