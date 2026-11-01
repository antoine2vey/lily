import {
  CanopyRepository,
  type MovedPlant,
} from '@lily/api/repositories/canopy.repository'
import { returnSharedPlants } from '@lily/api/services/canopy/helpers/return-shared-plants'
import {
  type ReminderContext,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import { Array, Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const dissolveCanopy = (
  canopyId: string,
  heirUserId: string
): Effect.Effect<ReadonlyArray<MovedPlant>, SqlError, ReminderContext> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const repo = yield* CanopyRepository
        if ((yield* repo.lock(canopyId)) === null) {
          return []
        }
        const plantIds = yield* repo.findPlantIdsOfCanopy(canopyId)
        return yield* withReminderKeys(reminderKeysFor(plantIds))(
          Effect.gen(function* () {
            const members = yield* repo.findMembersByJoinDate(canopyId)
            yield* Effect.forEach(
              Array.filter(members, (m) => m.userId !== heirUserId),
              (m) => returnSharedPlants(canopyId, m.userId),
              { discard: true }
            )
            const moved = yield* repo.transferToUser(canopyId, heirUserId)
            yield* repo.delete(canopyId)
            yield* rescheduleReminders(Array.map(moved, (plant) => plant.id))
            return moved
          })
        )
      })
    )
  }).pipe(
    Effect.withSpan('dissolveCanopy', {
      attributes: { 'canopy.id': canopyId },
    })
  )
