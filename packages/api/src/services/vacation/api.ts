import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  SetVacationRequest,
  UnauthorizedError,
  UserNotFoundError,
  VacationDateError,
  VacationNotFoundError,
  VacationState,
} from '@lily/shared'

// Define the Vacation API group
export const VacationApi = HttpApiGroup.make('vacation')
  .add(
    // GET /vacation - Current vacation state (uses CurrentUser)
    HttpApiEndpoint.get('getVacation')`/`
      .addSuccess(VacationState)
      .addError(UserNotFoundError, { status: 404 })
      .addError(UnauthorizedError, { status: 401 })
  )
  .add(
    // PUT /vacation - Schedule or update a vacation (uses CurrentUser)
    HttpApiEndpoint.put('setVacation')`/`
      .setPayload(SetVacationRequest)
      .addSuccess(VacationState)
      .addError(VacationDateError, { status: 400 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(UnauthorizedError, { status: 401 })
  )
  .add(
    // DELETE /vacation - Cancel a scheduled vacation or end an active one now
    HttpApiEndpoint.del('cancelVacation')`/`
      .addSuccess(VacationState)
      .addError(VacationNotFoundError, { status: 404 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(UnauthorizedError, { status: 401 })
  )
  .prefix('/vacation')
  .middleware(Authentication)
