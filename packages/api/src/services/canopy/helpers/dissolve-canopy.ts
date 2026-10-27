import {
  CanopyRepository,
  type MovedPlant,
} from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reschedule-reminders'
import { Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const dissolveCanopy = (
  canopyId: string,
  heirUserId: string
): Effect.Effect<
  ReadonlyArray<MovedPlant>,
  SqlError,
  | SqlClient.SqlClient
  | CanopyRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const repo = yield* CanopyRepository
        if ((yield* repo.lock(canopyId)) === null) {
          return []
        }
        const moved = yield* repo.transferToUser(canopyId, heirUserId)
        yield* repo.delete(canopyId)
        yield* Effect.forEach(moved, (plant) =>
          rescheduleReminders(plant, heirUserId)
        )
        return moved
      })
    )
  }).pipe(
    Effect.withSpan('dissolveCanopy', {
      attributes: { 'canopy.id': canopyId },
    })
  )
