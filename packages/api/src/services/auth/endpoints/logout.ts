import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { LogoutResponse } from '@lily/shared/auth'
import { Effect } from 'effect'

/**
 * Logout - revoke all refresh tokens for the current user
 * Requires authentication middleware to provide CurrentUser context
 */
export const logout = (): Effect.Effect<
  LogoutResponse,
  { message: string },
  CurrentUser | RefreshTokenRepository
> =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    const refreshTokenRepo = yield* RefreshTokenRepository

    // Revoke all refresh tokens for this user
    const revokedCount = yield* refreshTokenRepo.revokeAllForUser(user.id)

    yield* Effect.log(
      `Revoked ${revokedCount} refresh tokens for user ${user.id}`
    )

    return { message: 'Successfully logged out' }
  })
