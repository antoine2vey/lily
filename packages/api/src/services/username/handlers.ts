import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { UsernameService } from '@lily/api/services/username/service'
import { Effect, Layer } from 'effect'

// Implement the Username API group
export const UsernameApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'username', (handlers) =>
    Effect.gen(function* () {
      const usernameService = yield* UsernameService

      return handlers.handle('checkUsername', ({ urlParams: { username } }) =>
        usernameService.checkUsername(username).pipe(withInfraErrorsAsDefect)
      )
    })
  ).pipe(
    Layer.provide(UsernameService.Default),
    Layer.provide(UserRepositoryLive)
  )
