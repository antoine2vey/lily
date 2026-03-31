import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY_MS,
} from '@lily/api/services/auth/constants'
import { JWTService } from '@lily/api/services/jwt/service'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import type { AuthResponse, MagicLinkVerifyRequest } from '@lily/shared/auth'
import { DateTime, Duration, Effect, Option, pipe } from 'effect'

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
    const refreshTokenRepo = yield* RefreshTokenRepository
    const userRepo = yield* UserRepository
    const jwtService = yield* JWTService
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

    // Generate access token
    const accessToken = yield* jwtService.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    })

    // Generate refresh token
    const refreshToken = yield* jwtService.generateRefreshToken()
    const refreshTokenHash = yield* jwtService.hashRefreshToken(refreshToken)
    const refreshTokenExpiry = DateTime.toDateUtc(
      DateTime.addDuration(
        DateTime.unsafeNow(),
        Duration.millis(REFRESH_TOKEN_EXPIRY_MS)
      )
    )

    // Store hashed refresh token
    yield* refreshTokenRepo.create(
      user.id,
      refreshTokenHash,
      refreshTokenExpiry
    )

    // Build user profile response
    const userProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.name || undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      status: user.status,
    }

    return {
      user: userProfile,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    }
  }).pipe(Effect.withSpan('AuthService.verifyMagicLink'))
