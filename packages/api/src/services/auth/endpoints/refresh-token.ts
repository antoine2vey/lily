import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY_MS,
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

/** A refresh token is unusable once its absolute expiry has passed. */
const isExpired = (expiresAt: Date): boolean =>
  DateTime.lessThan(DateTime.unsafeMake(expiresAt), DateTime.unsafeNow())

/**
 * Refresh access token using refresh token.
 *
 * Implements token rotation with a recoverable chain: the presented token is
 * revoked and a new one issued, linked via `replacedBy`. When a *revoked* token
 * is presented we distinguish two cases by inspecting its successor:
 *
 *  - successor still active/unexpired → the rotation response never reached the
 *    client (e.g. a dropped connection on a cold app launch). We recover by
 *    rotating the successor forward instead of forcing a logout. This is the
 *    main fix for users getting signed out when reopening the app after a day.
 *  - successor missing/already superseded → the token is being replayed after
 *    the chain moved on, which signals theft: revoke the whole family.
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

    // Hash the provided token to look it up (plaintext is never stored)
    const tokenHash = yield* jwtService.hashRefreshToken(refreshToken)

    // Look up the presented token in any state (active or revoked) so we can
    // tell apart a genuine reuse from a lost-rotation-response retry.
    const presented = yield* refreshTokenRepo.findByTokenHash(tokenHash)

    if (!presented || isExpired(presented.expiresAt)) {
      return yield* Effect.fail({ message: 'Invalid or expired refresh token' })
    }

    // Resolve which token to rotate. An active token rotates directly; a revoked
    // token is recoverable only if its successor was never consumed.
    const tokenToRotate = yield* Effect.gen(function* () {
      if (!presented.revokedAt) {
        return presented
      }

      const successor = presented.replacedBy
        ? yield* refreshTokenRepo.findById(presented.replacedBy)
        : null

      const successorUsable =
        successor !== null &&
        successor.revokedAt === null &&
        !isExpired(successor.expiresAt)

      if (successorUsable) {
        // Lost-response recovery: the client never received `successor`.
        return successor
      }

      // Replay of a token whose chain already advanced → treat as theft.
      yield* refreshTokenRepo.revokeAllForUser(presented.userId)
      return yield* Effect.fail({
        message: 'Refresh token reuse detected',
      })
    })

    // Rate limit per user to prevent abuse. Propagated as 429 so the client
    // treats it as transient and retries rather than discarding the session.
    yield* rateLimiter.checkRateLimit(
      `refresh:${tokenToRotate.userId}`,
      RATE_LIMITS.REFRESH
    )

    // Get user
    const user = yield* userRepo.findById(tokenToRotate.userId)

    if (!user) {
      // Revoke the token since user doesn't exist
      yield* refreshTokenRepo.revoke(tokenToRotate.id)
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
    const created = yield* refreshTokenRepo.create(
      user.id,
      newRefreshTokenHash,
      refreshTokenExpiry
    )

    if (!created) {
      return yield* Effect.fail({ message: 'Failed to issue refresh token' })
    }

    // Revoke the rotated token and link it to its successor so the chain can be
    // followed for lost-response recovery and reuse detection.
    yield* refreshTokenRepo.revokeWithReplacement(tokenToRotate.id, created.id)

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    }
  }).pipe(Effect.withSpan('AuthService.refreshToken'))
