import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { activateVacation } from '@lily/api/services/vacation/helpers/activate-vacation'
import {
  retryLostClaims,
  VacationClaimLost,
} from '@lily/api/services/vacation/helpers/lost-claim'
import { toVacationState } from '@lily/api/services/vacation/helpers/vacation-state'
import {
  type SetVacationRequest,
  VACATION_MAX_DURATION_DAYS,
  VacationDateError,
  type VacationState,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const attemptSet = (request: SetVacationRequest) =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository
    const user = yield* userRepo.findById(id)

    if (!user) {
      return yield* new UserNotFoundError()
    }

    const nowDt = DateTime.nowUnsafe()
    const startDt = DateTime.makeUnsafe(request.startDate)
    const endDt = DateTime.makeUnsafe(request.endDate)

    if (DateTime.isGreaterThanOrEqualTo(startDt, endDt)) {
      return yield* new VacationDateError({
        message: 'End date must be after start date',
      })
    }
    if (DateTime.isLessThanOrEqualTo(endDt, nowDt)) {
      return yield* new VacationDateError({
        message: 'End date must be in the future',
      })
    }
    if (
      Duration.toMillis(DateTime.distance(startDt, endDt)) >
      Duration.toMillis(Duration.days(VACATION_MAX_DURATION_DAYS))
    ) {
      return yield* new VacationDateError({
        message: `Vacation cannot be longer than ${VACATION_MAX_DURATION_DAYS} days`,
      })
    }

    const claimed = yield* Match.value(user.vacationStatus).pipe(
      Match.when('active', () =>
        Effect.gen(function* () {
          const startUnchanged = pipe(
            Option.fromNullishOr(user.vacationStart),
            Option.map(
              (existing) =>
                DateTime.toEpochMillis(DateTime.makeUnsafe(existing)) ===
                DateTime.toEpochMillis(startDt)
            ),
            Option.getOrElse(() => false)
          )
          if (!startUnchanged) {
            return yield* new VacationDateError({
              message: 'Cannot change the start date of an active vacation',
            })
          }
          return yield* userRepo.transitionVacation(user, {
            vacationStatus: 'active',
            vacationEnd: request.endDate,
          })
        })
      ),
      Match.whenOr('none', 'scheduled', () =>
        DateTime.isLessThanOrEqualTo(startDt, nowDt)
          ? activateVacation({
              expected: user,
              range: {
                vacationStart: request.startDate,
                vacationEnd: request.endDate,
              },
            })
          : userRepo.transitionVacation(user, {
              vacationStatus: 'scheduled',
              vacationStart: request.startDate,
              vacationEnd: request.endDate,
            })
      ),
      Match.exhaustive
    )
    if (!claimed) {
      return yield* new VacationClaimLost({ userId: id })
    }

    return toVacationState(claimed)
  })

/**
 * Schedule (or reschedule) a vacation.
 *
 * - status 'none' / 'scheduled': stores the range as 'scheduled'; if the
 *   start is already in the past, activates right away in the same write
 *   (snappy UX — no waiting for the 5-minute scheduler poll).
 * - status 'active': only the end date may change (extend/shorten). Ending
 *   now is expressed via DELETE (cancelVacation), not a past end date.
 */
export const setVacation = (
  request: SetVacationRequest
): Effect.Effect<
  VacationState,
  SqlError | VacationDateError | UserNotFoundError,
  UserRepository | NotificationRepository | SqlClient.SqlClient | CurrentUser
> =>
  pipe(
    attemptSet(request),
    retryLostClaims,
    Effect.withSpan('VacationService.setVacation')
  )
