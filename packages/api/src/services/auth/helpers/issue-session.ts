import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY_MS,
} from '@lily/api/services/auth/constants'
import { JWTService } from '@lily/api/services/jwt/service'
import type { users } from '@lily/db/schema'
import { DateTime, Duration, Effect } from 'effect'

type UserRow = typeof users.$inferSelect

/**
 * Build an `AuthResponse` for a verified user — signs a fresh access token,
 * mints + persists a refresh token, and shapes the user profile. Shared by the
 * magic-link and OAuth sign-in endpoints so token issuance stays in one place.
 */
export const issueSession = (user: UserRow) =>
  Effect.gen(function* () {
    const jwtService = yield* JWTService
    const refreshTokenRepo = yield* RefreshTokenRepository

    const accessToken = yield* jwtService.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    })

    const refreshToken = yield* jwtService.generateRefreshToken()
    const refreshTokenHash = yield* jwtService.hashRefreshToken(refreshToken)
    const refreshTokenExpiry = DateTime.toDateUtc(
      DateTime.addDuration(
        DateTime.unsafeNow(),
        Duration.millis(REFRESH_TOKEN_EXPIRY_MS)
      )
    )

    yield* refreshTokenRepo.create(
      user.id,
      refreshTokenHash,
      refreshTokenExpiry
    )

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.name || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        role: user.role,
        status: user.status,
      },
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    }
  })
