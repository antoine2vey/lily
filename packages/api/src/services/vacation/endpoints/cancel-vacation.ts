import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import {
  retryLostClaims,
  VacationClaimLost,
} from '@lily/api/services/vacation/helpers/lost-claim'
import {
  nowAsDate,
  VacationNotFoundError,
  type VacationState,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect, Match, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const attemptCancel = Effect.gen(function* () {
  const { id } = yield* CurrentUser
  const userRepo = yield* UserRepository
  const user = yield* userRepo.findById(id)

  if (!user) {
    return yield* new UserNotFoundError()
  }

  const claimed = yield* Match.value(user.vacationStatus).pipe(
    Match.when('none', () => new VacationNotFoundError()),
    Match.when('scheduled', () =>
      userRepo.transitionVacation(user, {
        vacationStatus: 'none',
        vacationStart: null,
        vacationEnd: null,
      })
    ),
    Match.when('active', () =>
      endVacation({ user, effectiveEnd: nowAsDate() })
    ),
    Match.exhaustive
  )
  if (!claimed) {
    return yield* new VacationClaimLost({ userId: id })
  }

  return {
    status: 'none' as const,
    startDate: null,
    endDate: null,
  }
})

/**
 * Cancel a scheduled vacation, or end an active one right now.
 *
 * - 'scheduled': plain reset — activation side effects never ran.
 * - 'active': the "end vacation now" button — runs the full end-routine
 *   (schedule shift + reminder rebuild) with effectiveEnd = now.
 * - 'none': nothing to cancel.
 *
 * Each write is a conditional update against the row just read. A lost
 * claim (the scheduler activated or ended the vacation in between) re-runs
 * the read and dispatches on the new status.
 */
export const cancelVacation = (): Effect.Effect<
  VacationState,
  SqlError | VacationNotFoundError | UserNotFoundError,
  | UserRepository
  | CareScheduleRepository
  | DelegationRepository
  | NotificationRepository
  | CanopyRepository
  | SqlClient.SqlClient
  | CurrentUser
> =>
  pipe(
    attemptCancel,
    retryLostClaims,
    Effect.withSpan('VacationService.cancelVacation')
  )
