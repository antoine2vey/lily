import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { UsernameService } from '@lily/api/services/username/service'
import { Database } from '@lily/db'
import { Effect, Layer } from 'effect'

// Implement the Username API group
export const UsernameApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'username', (handlers) =>
    Effect.gen(function* () {
      const usernameService = yield* UsernameService

      return handlers.handle('checkUsername', () =>
        usernameService.checkUsername('testuser')
      )
    })
  ).pipe(
    Layer.provide(UsernameService.Default),
    Layer.provide(Database.Default)
  )
