import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthService } from '@lily/api/services/auth/service'
import { DrizzleLive } from '@lily/db'
import { Auth } from '@lily/db/lib/auth'
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
    })
  ).pipe(
    Layer.provide(AuthService.Default),
    Layer.provide(UserRepositoryLive),
    Layer.provide(DrizzleLive),
    Layer.provide(Auth.Default)
  )
