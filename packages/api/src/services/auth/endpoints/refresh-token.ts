import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { JWTService } from '@lily/api/services/jwt/service'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { nowAsDate } from '@lily/shared'
import type {
  RefreshTokenRequest,
  RefreshTokenResponse,
} from '@lily/shared/auth'
import { Effect } from 'effect'

// Access token expiry in seconds for response
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60
// Refresh token expiry: 30 days
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Refresh access token using refresh token.
 * Implements token rotation: old refresh token is revoked and a new one issued.
 */
export const refreshToken = ({
  refreshToken,
}: RefreshTokenRequest): Effect.Effect<
  RefreshTokenResponse,
  { message: string },
  RefreshTokenRepository | UserRepository | JWTService | RateLimiterService
> =>
  Effect.gen(function* () {
    const refreshTokenRepo = yield* RefreshTokenRepository
    const userRepo = yield* UserRepository
    const jwtService = yield* JWTService
    const rateLimiter = yield* RateLimiterService

    // Hash the provided token to look it up
    const tokenHash = yield* jwtService.hashRefreshToken(refreshToken)

    // Find valid refresh token
    const storedToken = yield* refreshTokenRepo.findValidByTokenHash(tokenHash)

    if (!storedToken) {
      return yield* Effect.fail({ message: 'Invalid or expired refresh token' })
    }

    // Rate limit per user to prevent abuse
    yield* rateLimiter
      .checkRateLimit(`refresh:${storedToken.userId}`, RATE_LIMITS.REFRESH)
      .pipe(
        Effect.catchTag('RateLimitExceededError', () =>
          Effect.fail({
            message: 'Too many refresh attempts. Try again later.',
          })
        )
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
        message: `Account is ${user.status}`,
      })
    }

    // Revoke the old refresh token (rotation)
    yield* refreshTokenRepo.revoke(storedToken.id)

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
    const refreshTokenExpiry = new Date(
      nowAsDate().getTime() + REFRESH_TOKEN_EXPIRY_MS
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
