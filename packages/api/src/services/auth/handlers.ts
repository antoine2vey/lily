import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { Auth } from '@lily/api/services/auth/auth'
import { AuthService } from '@lily/api/services/auth/service'
import { Effect, Layer } from 'effect'

// Implement the Auth API group
export const AuthApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'auth', (handlers) =>
    Effect.gen(function* () {
      const authService = yield* AuthService

      return handlers
        .handle('sendMagicLink', ({ payload }) =>
          authService.sendMagicLink(payload)
        )
        .handle('verifyMagicLink', ({ payload }) =>
          authService.verifyMagicLink(payload)
        )
        .handle('getCurrentUser', () => authService.getCurrentUser())
        .handle('signOut', () => authService.signOut())
        .handle('setUsername', ({ payload }) =>
          authService.setUsername(payload)
        )
        .handle('resendVerificationEmail', ({ payload }) =>
          authService.resendVerificationEmail(payload)
        )
        .handle('verifyEmail', ({ payload }) =>
          authService.verifyEmail(payload)
        )
        .handle('refreshToken', () => authService.refreshToken())
    })
  ).pipe(
    Layer.provide(AuthService.Default),
    Layer.provide(UserRepositoryLive),
    Layer.provide(Auth.Default)
  )
