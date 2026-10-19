import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  UserRepository,
  type VacationSnapshot,
} from '@lily/api/repositories/user.repository'
import type { users } from '@lily/db/schema'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface ActivateVacationParams {
  readonly expected: VacationSnapshot
  readonly range?: { vacationStart: Date; vacationEnd: Date }
}

export const activateVacation = (
  params: ActivateVacationParams
): Effect.Effect<
  typeof users.$inferSelect | null,
  SqlError,
  UserRepository | NotificationRepository
> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const claimed = yield* userRepo.transitionVacation(params.expected, {
      vacationStatus: 'active',
      ...params.range,
    })
    if (!claimed) {
      return null
    }

    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.deletePendingByUserIdAndTypes(
      claimed.id,
      VACATION_MUTED_TOPICS
    )
    return claimed
  }).pipe(
    Effect.withSpan('VacationService.activateVacation', {
      attributes: { 'user.id': params.expected.id },
    })
  )
