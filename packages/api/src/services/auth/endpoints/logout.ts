import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { LogoutResponse } from '@lily/shared/auth'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const logout: Effect.Effect<
  LogoutResponse,
  SqlError,
  CurrentUser | RefreshTokenRepository
> = Effect.gen(function* () {
  const user = yield* CurrentUser
  const refreshTokenRepo = yield* RefreshTokenRepository

  yield* refreshTokenRepo.revokeAllForUser(user.id)

  return { message: 'Successfully logged out' }
}).pipe(Effect.withSpan('AuthService.logout'))
