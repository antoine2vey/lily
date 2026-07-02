import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY_MS,
  REFRESH_TOKEN_ROTATION_GRACE_MS,
} from '@lily/api/services/auth/constants'
import { JWTService } from '@lily/api/services/jwt/service'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import type {
  RefreshTokenRequest,
  RefreshTokenResponse,
} from '@lily/shared/auth'
import { DateTime, Duration, Effect } from 'effect'

/**
 * Refresh access token using refresh token.
 * Implements token rotation: old refresh token is revoked and a new one
 * issued. A just-rotated token is honored within a short grace window so
 * concurrent refreshes from the same device don't log the user out.
 */
export const refreshToken = ({
  refreshToken,
}: RefreshTokenRequest): Effect.Effect<
  RefreshTokenResponse,
  { message: string } | RateLimitExceededError,
  RefreshTokenRepository | UserRepository | JWTService | RateLimiterService
> =>
  Effect.gen(function* () {
    const refreshTokenRepo = yield* RefreshTokenRepository
    const userRepo = yield* UserRepository
    const jwtService = yield* JWTService
    const rateLimiter = yield* RateLimiterService

    // Hash the provided token to look it up
    const tokenHash = yield* jwtService.hashRefreshToken(refreshToken)

    // Find valid refresh token (active, or rotated within the grace window)
    const storedToken = yield* refreshTokenRepo.findValidByTokenHash(
      tokenHash,
      REFRESH_TOKEN_ROTATION_GRACE_MS
    )

    if (!storedToken) {
      return yield* Effect.fail({ message: 'Invalid or expired refresh token' })
    }

    // Rate limit per user to prevent abuse. Propagated as 429 so clients
    // can distinguish throttling from an invalid session (401).
    yield* rateLimiter.checkRateLimit(
      `refresh:${storedToken.userId}`,
      RATE_LIMITS.REFRESH
    )

    // Get user
    const user = yield* userRepo.findById(storedToken.userId)

    if (!user) {
      // Revoke the token since user doesn't exist
      yield* refreshTokenRepo.revoke(storedToken.id)
      return yield* Effect.fail({ message: 'User not found' })
    }

    // Check user status
    if (user.status !== 'active') {
      // Revoke all tokens for suspended/banned user
      yield* refreshTokenRepo.revokeAllForUser(user.id)
      return yield* Effect.fail({
        message: 'Account is not active',
        status: user.status,
      })
    }

    // Revoke the old refresh token (rotation). A token reused within the
    // grace window is already revoked — keep its original revocation time
    // so the window doesn't slide.
    if (storedToken.revokedAt === null) {
      yield* refreshTokenRepo.revoke(storedToken.id)
    }

    // Generate new access token
    const accessToken = yield* jwtService.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    })

    // Generate new refresh token (rotation)
    const newRefreshToken = yield* jwtService.generateRefreshToken()
    const newRefreshTokenHash =
      yield* jwtService.hashRefreshToken(newRefreshToken)
    const refreshTokenExpiry = DateTime.toDateUtc(
      DateTime.addDuration(
        DateTime.unsafeNow(),
        Duration.millis(REFRESH_TOKEN_EXPIRY_MS)
      )
    )

    // Store the new hashed refresh token
    yield* refreshTokenRepo.create(
      user.id,
      newRefreshTokenHash,
      refreshTokenExpiry
    )

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    }
  }).pipe(Effect.withSpan('AuthService.refreshToken'))
