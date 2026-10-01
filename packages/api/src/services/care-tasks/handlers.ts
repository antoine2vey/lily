import type { Api } from '@lily/api/api'
import { findCareTasks } from '@lily/api/services/care-tasks/endpoints/find-care-tasks'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { HttpApiBuilder } from 'effect/http-api'

export const CareTasksApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'careTasks', (handlers) =>
    handlers.handle('getCareTasks', () =>
      findCareTasks().pipe(withInfraErrorsAsDefect)
    )
  )
