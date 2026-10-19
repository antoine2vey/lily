import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  UserRepository,
  type VacationSnapshot,
} from '@lily/api/repositories/user.repository'
import type { users } from '@lily/db/schema'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface ActivateVacationParams {
  readonly expected: VacationSnapshot
  readonly range?: { vacationStart: Date; vacationEnd: Date }
}

/**
 * Claims the transition and deletes the user's pending muted rows in one
 * transaction, so a failed delete rolls the claim back and the next poll
 * retries. Returns null, with nothing written, when a concurrent write
 * changed the row since `expected` was read.
 */
export const activateVacation = (
  params: ActivateVacationParams
): Effect.Effect<
  typeof users.$inferSelect | null,
  SqlError,
  UserRepository | NotificationRepository | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const userRepo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const claimed = yield* userRepo.transitionVacation(params.expected, {
          vacationStatus: 'active',
          ...params.range,
        })
        if (!claimed) {
          return null
        }
        yield* notificationRepo.deletePendingByUserIdAndTypes(
          claimed.id,
          VACATION_MUTED_TOPICS
        )
        return claimed
      })
    )
  }).pipe(
    Effect.withSpan('VacationService.activateVacation', {
      attributes: { 'user.id': params.expected.id },
    })
  )
