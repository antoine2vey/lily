import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { CareTasksService } from '@lily/api/services/care-tasks/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { Effect, Layer } from 'effect'

// Implement the Care Tasks API group
export const CareTasksApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'careTasks', (handlers) =>
    Effect.gen(function* () {
      const careTasksService = yield* CareTasksService

      return handlers.handle('getCareTasks', () =>
        careTasksService.findCareTasks().pipe(withInfraErrorsAsDefect)
      )
    })
  ).pipe(
    Layer.provide(CareTasksService.Default),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
