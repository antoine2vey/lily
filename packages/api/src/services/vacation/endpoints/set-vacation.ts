import { Absence } from '@lily/api/contexts/absence'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { fromVacation } from '@lily/api/services/vacation/helpers/vacation-state'
import type { SetVacationRequest } from '@lily/shared'
import { DateTime, Effect } from 'effect'

export const setVacation = Effect.fn('VacationService.setVacation')(function* (
  request: SetVacationRequest
) {
  const { id: userId } = yield* CurrentUser
  const absence = yield* Absence
  const vacation = yield* absence.setVacation({
    userId,
    start: DateTime.makeUnsafe(request.startDate),
    end: DateTime.makeUnsafe(request.endDate),
  })
  return fromVacation(vacation)
})
