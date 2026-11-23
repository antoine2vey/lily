import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY,
  REFRESH_TOKEN_ROTATION_GRACE_MS,
} from '@lily/api/services/auth/constants'
import { JWTService } from '@lily/api/services/jwt/service'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { AuthError } from '@lily/shared'
import type {
  RefreshTokenRequest,
  RefreshTokenResponse,
} from '@lily/shared/auth'
import { DateTime, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

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
  AuthError | RateLimitExceededError | SqlError,
  RefreshTokenRepository | UserRepository | JWTService | RateLimiterService
> =>
  Effect.gen(function* () {
    const refreshTokenRepo = yield* RefreshTokenRepository
    const userRepo = yield* UserRepository
    const jwtService = yield* JWTService
    const rateLimiter = yield* RateLimiterService

    const tokenHash = yield* jwtService.hashRefreshToken(refreshToken)

    const storedToken = yield* refreshTokenRepo.findValidByTokenHash(
      tokenHash,
      REFRESH_TOKEN_ROTATION_GRACE_MS
    )

    if (!storedToken) {
      return yield* new AuthError({
        message: 'Invalid or expired refresh token',
      })
    }

    // Rate limit per user to prevent abuse. Propagated as 429 so clients
    // can distinguish throttling from an invalid session (401).
    yield* rateLimiter.checkRateLimit(
      `refresh:${storedToken.userId}`,
      RATE_LIMITS.REFRESH
    )

    const user = yield* userRepo.findById(storedToken.userId)

    if (!user) {
      yield* refreshTokenRepo.revoke(storedToken.id)
      return yield* new AuthError({ message: 'User not found' })
    }

    if (user.status !== 'active') {
      yield* refreshTokenRepo.revokeAllForUser(user.id)
      return yield* new AuthError({ message: 'Account is not active' })
    }

    // Revoke the old refresh token (rotation). A token reused within the
    // grace window is already revoked — keep its original revocation time
    // so the window doesn't slide.
    if (storedToken.revokedAt === null) {
      yield* refreshTokenRepo.revoke(storedToken.id)
    }

    const accessToken = yield* jwtService.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    })

    const newRefreshToken = yield* jwtService.generateRefreshToken
    const newRefreshTokenHash =
      yield* jwtService.hashRefreshToken(newRefreshToken)
    const refreshTokenExpiry = DateTime.toDateUtc(
      DateTime.addDuration(DateTime.nowUnsafe(), REFRESH_TOKEN_EXPIRY)
    )

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
  }).pipe(
    Effect.catchTag('JWTError', (error) =>
      Effect.fail(new AuthError({ message: error.message }))
    ),
    Effect.withSpan('AuthService.refreshToken')
  )
