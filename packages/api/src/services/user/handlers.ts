import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { UserService } from '@lily/api/services/user/service'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer } from 'effect'

// Implement the Users API group
export const UsersApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'users', (handlers) =>
    Effect.gen(function* () {
      const userService = yield* UserService

      return handlers
        .handle('getUserSettings', () =>
          userService.getUserSettings().pipe(withInfraErrorsAsDefect)
        )
        .handle('updateUserSettings', ({ payload }) =>
          userService.updateUserSettings(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('uploadAvatar', ({ payload: { files } }) =>
          userService.uploadAvatar(files).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(UserService.Default),
    Layer.provide(UserRepositoryLive),
    Layer.provide(NotificationRepositoryLive),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(GCSService.Default),
    Layer.provide(FileService.Default),
    Layer.provide(AuthenticationLive)
  )
