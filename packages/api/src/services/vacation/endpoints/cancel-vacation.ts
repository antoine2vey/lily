import { Absence } from '@lily/api/contexts/absence'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { NO_VACATION } from '@lily/api/services/vacation/helpers/vacation-state'
import { Effect } from 'effect'

export const cancelVacation = Effect.fn('VacationService.cancelVacation')(
  function* () {
    const { id: userId } = yield* CurrentUser
    const absence = yield* Absence
    yield* absence.cancelVacation({ userId })
    return NO_VACATION
  }
)
