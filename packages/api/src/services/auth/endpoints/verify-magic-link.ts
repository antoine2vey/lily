import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { JWTService } from '@lily/api/services/jwt/service'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { users } from '@lily/db/schema/users'
import { nowAsDate } from '@lily/shared'
import type { AuthResponse, MagicLinkVerifyRequest } from '@lily/shared/auth'
import { eq } from 'drizzle-orm'
import { Array, Effect, Option, pipe } from 'effect'

// Refresh token expiry: 30 days
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000
// Access token expiry in seconds for response
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60

/**
 * Verify magic link token and exchange for JWT tokens
 * This is called by the app after receiving the code from the deep link
 */
export const verifyMagicLink = ({
  code,
}: MagicLinkVerifyRequest): Effect.Effect<
  AuthResponse,
  { message: string },
  | MagicLinkRepository
  | RefreshTokenRepository
  | UserRepository
  | JWTService
  | RateLimiterService
  | PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository
    const refreshTokenRepo = yield* RefreshTokenRepository
    const userRepo = yield* UserRepository
    const jwtService = yield* JWTService
    const rateLimiter = yield* RateLimiterService
    const db = yield* PgDrizzle.PgDrizzle

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(code)) {
      return yield* Effect.fail({ message: 'Invalid code format' })
    }

    // Check rate limit
    yield* rateLimiter.checkRateLimit(`verify:${code}`, RATE_LIMITS.VERIFY)

    // Find and validate the magic link
    const magicLink = yield* magicLinkRepo.findValidByToken(code)

    if (!magicLink) {
      return yield* Effect.fail({ message: 'Invalid or expired code' })
    }

    // Mark as used immediately (one-time use)
    yield* magicLinkRepo.markUsed(magicLink.id)

    // Find or create user
    let user = yield* userRepo.findByEmail(magicLink.email)

    if (!user) {
      // Create new user with email verified
      const newUsers = yield* db
        .insert(users)
        .values({
          email: magicLink.email,
          emailVerified: true,
        })
        .returning()

      user = pipe(newUsers, Array.head, Option.getOrNull)
    } else {
      // Update emailVerified if not already
      if (!user.emailVerified) {
        yield* db
          .update(users)
          .set({ emailVerified: true, updatedAt: nowAsDate() })
          .where(eq(users.id, user.id))
        user = { ...user, emailVerified: true }
      }
    }

    if (!user) {
      return yield* Effect.fail({ message: 'Failed to create user' })
    }

    // Check user status
    if (user.status !== 'active') {
      return yield* Effect.fail({
        message: `Account is ${user.status}`,
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
    const refreshTokenExpiry = new Date(
      nowAsDate().getTime() + REFRESH_TOKEN_EXPIRY_MS
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
  })
