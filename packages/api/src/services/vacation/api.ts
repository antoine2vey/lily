import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  SetVacationRequest,
  UnauthorizedError,
  UserNotFoundError,
  VacationDateError,
  VacationNotFoundError,
  VacationState,
} from '@lily/shared'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

// Define the Vacation API group
export const VacationApi = HttpApiGroup.make('vacation')
  .add(
    // GET /vacation - Current vacation state (uses CurrentUser)
    HttpApiEndpoint.get('getVacation', '/', {
      success: VacationState,
      error: [UserNotFoundError, UnauthorizedError],
    })
  )
  .add(
    // PUT /vacation - Schedule or update a vacation (uses CurrentUser)
    HttpApiEndpoint.put('setVacation', '/', {
      payload: SetVacationRequest,
      success: VacationState,
      error: [VacationDateError, UserNotFoundError, UnauthorizedError],
    })
  )
  .add(
    // DELETE /vacation - Cancel a scheduled vacation or end an active one now
    HttpApiEndpoint.delete('cancelVacation', '/', {
      success: VacationState,
      error: [VacationNotFoundError, UserNotFoundError, UnauthorizedError],
    })
  )
  .prefix('/vacation')
  .middleware(Authentication)
