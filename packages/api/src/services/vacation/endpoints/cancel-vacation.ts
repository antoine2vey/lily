import type { SqlError } from '@effect/sql/SqlError'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import {
  nowAsDate,
  VacationNotFoundError,
  type VacationState,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect, Match } from 'effect'

/**
 * Cancel a scheduled vacation, or end an active one right now.
 *
 * - 'scheduled': plain reset — activation side effects never ran.
 * - 'active': the "end vacation now" button — runs the full end-routine
 *   (schedule shift + reminder rebuild) with effectiveEnd = now.
 * - 'none': nothing to cancel.
 */
export const cancelVacation = (): Effect.Effect<
  VacationState,
  SqlError | VacationNotFoundError | UserNotFoundError,
  | UserRepository
  | CareScheduleRepository
  | DelegationRepository
  | NotificationRepository
  | CurrentUser
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository
    const user = yield* userRepo.findById(id)

    if (!user) {
      return yield* new UserNotFoundError()
    }

    yield* Match.value(user.vacationStatus).pipe(
      Match.when('none', () => new VacationNotFoundError()),
      Match.when('scheduled', () =>
        userRepo.update(id, {
          vacationStatus: 'none',
          vacationStart: null,
          vacationEnd: null,
        })
      ),
      Match.when('active', () =>
        endVacation({ userId: id, effectiveEnd: nowAsDate() })
      ),
      Match.exhaustive
    )

    return {
      status: 'none' as const,
      startDate: null,
      endDate: null,
    }
  }).pipe(Effect.withSpan('VacationService.cancelVacation'))
