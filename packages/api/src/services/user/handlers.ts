import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { UserService } from '@lily/api/services/user/service'
import { Effect, Layer } from 'effect'

// Implement the Users API group
export const UsersApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'users', (handlers) =>
    Effect.gen(function* () {
      const userService = yield* UserService

      return handlers
        .handle('getUserSettings', ({ path: { id } }) =>
          userService.getUserSettings(id)
        )
        .handle('updateUserSettings', ({ path: { id }, payload }) =>
          userService.updateUserSettings(id, payload)
        )
    })
  ).pipe(
    Layer.provide(UserService.Default),
    Layer.provide(UserRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
