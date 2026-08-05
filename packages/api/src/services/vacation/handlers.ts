import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { cancelVacation } from '@lily/api/services/vacation/endpoints/cancel-vacation'
import { getVacation } from '@lily/api/services/vacation/endpoints/get-vacation'
import { setVacation } from '@lily/api/services/vacation/endpoints/set-vacation'

export const VacationApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'vacation', (handlers) =>
    handlers
      .handle('getVacation', () => getVacation().pipe(withInfraErrorsAsDefect))
      .handle('setVacation', ({ payload }) =>
        setVacation(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('cancelVacation', () =>
        cancelVacation().pipe(withInfraErrorsAsDefect)
      )
  )
