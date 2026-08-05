import type { SqlError } from '@effect/sql/SqlError'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { activateVacation } from '@lily/api/services/vacation/helpers/activate-vacation'
import {
  type SetVacationRequest,
  VACATION_MAX_DURATION_DAYS,
  VacationDateError,
  type VacationState,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'

/**
 * Schedule (or reschedule) a vacation.
 *
 * - status 'none' / 'scheduled': stores the range as 'scheduled'; if the
 *   start is already in the past, activates immediately (snappy UX — no
 *   waiting for the 5-minute scheduler poll).
 * - status 'active': only the end date may change (extend/shorten). Ending
 *   now is expressed via DELETE (cancelVacation), not a past end date.
 */
export const setVacation = (
  request: SetVacationRequest
): Effect.Effect<
  VacationState,
  SqlError | VacationDateError | UserNotFoundError,
  UserRepository | NotificationRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository
    const user = yield* userRepo.findById(id)

    if (!user) {
      return yield* new UserNotFoundError()
    }

    const nowDt = DateTime.unsafeNow()
    const startDt = DateTime.unsafeMake(request.startDate)
    const endDt = DateTime.unsafeMake(request.endDate)

    if (DateTime.greaterThanOrEqualTo(startDt, endDt)) {
      return yield* new VacationDateError({
        message: 'End date must be after start date',
      })
    }
    if (DateTime.lessThanOrEqualTo(endDt, nowDt)) {
      return yield* new VacationDateError({
        message: 'End date must be in the future',
      })
    }
    if (
      DateTime.distance(startDt, endDt) >
      Duration.toMillis(Duration.days(VACATION_MAX_DURATION_DAYS))
    ) {
      return yield* new VacationDateError({
        message: `Vacation cannot be longer than ${VACATION_MAX_DURATION_DAYS} days`,
      })
    }

    return yield* Match.value(user.vacationStatus).pipe(
      Match.when('active', () =>
        Effect.gen(function* () {
          const startUnchanged = pipe(
            Option.fromNullable(user.vacationStart),
            Option.map(
              (existing) =>
                DateTime.toEpochMillis(DateTime.unsafeMake(existing)) ===
                DateTime.toEpochMillis(startDt)
            ),
            Option.getOrElse(() => false)
          )
          if (!startUnchanged) {
            return yield* new VacationDateError({
              message: 'Cannot change the start date of an active vacation',
            })
          }
          yield* userRepo.update(id, { vacationEnd: request.endDate })
          return {
            status: 'active' as const,
            startDate: user.vacationStart,
            endDate: request.endDate,
          }
        })
      ),
      Match.whenOr('none', 'scheduled', () =>
        Effect.gen(function* () {
          yield* userRepo.update(id, {
            vacationStatus: 'scheduled',
            vacationStart: request.startDate,
            vacationEnd: request.endDate,
          })
          const startsNow = DateTime.lessThanOrEqualTo(startDt, nowDt)
          if (startsNow) {
            yield* activateVacation(id)
          }
          return {
            status: startsNow ? ('active' as const) : ('scheduled' as const),
            startDate: request.startDate,
            endDate: request.endDate,
          }
        })
      ),
      Match.exhaustive
    )
  }).pipe(Effect.withSpan('VacationService.setVacation'))
