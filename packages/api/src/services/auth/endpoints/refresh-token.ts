import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { JWTService } from '@lily/api/services/jwt/service'
import type {
  RefreshTokenRequest,
  RefreshTokenResponse,
} from '@lily/shared/auth'
import { Effect } from 'effect'

// Access token expiry in seconds for response
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60

/**
 * Refresh access token using refresh token
 */
export const refreshToken = ({
  refreshToken,
}: RefreshTokenRequest): Effect.Effect<
  RefreshTokenResponse,
  { message: string },
  RefreshTokenRepository | UserRepository | JWTService
> =>
  Effect.gen(function* () {
    const refreshTokenRepo = yield* RefreshTokenRepository
    const userRepo = yield* UserRepository
    const jwtService = yield* JWTService

    // Hash the provided token to look it up
    const tokenHash = yield* jwtService.hashRefreshToken(refreshToken)

    // Find valid refresh token
    const storedToken = yield* refreshTokenRepo.findValidByTokenHash(tokenHash)

    if (!storedToken) {
      return yield* Effect.fail({ message: 'Invalid or expired refresh token' })
    }

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

    // Generate new access token
    const accessToken = yield* jwtService.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    })

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    }
  }).pipe(Effect.withSpan('AuthService.refreshToken'))
