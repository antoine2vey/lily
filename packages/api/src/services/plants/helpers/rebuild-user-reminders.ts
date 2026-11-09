import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import {
  canopyPlantIdsOf,
  type ReminderContext,
  rebuildMemberReminders,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import { Array, Effect, Option } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const lockReminderPlantsOf = (userId: string) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const inCanopy = yield* lockMyCanopy(userId).pipe(
      Effect.as(true),
      Effect.catchTag('CanopyNotFoundError', () => Effect.succeed(false))
    )
    return {
      personal: yield* plantRepo.findPersonalReminderPlantIds(userId),
      canopy: inCanopy ? yield* canopyPlantIdsOf(userId) : [],
    }
  })

export const withUserRemindersRebuilt =
  (userId: string) =>
  <A, E, R>(
    change: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | ReminderContext> =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const { personal, canopy } = yield* lockReminderPlantsOf(userId)
          return yield* withReminderKeys(
            reminderKeysFor(Array.dedupe([...personal, ...canopy])),
            Option.some(userId)
          )(
            change.pipe(
              Effect.tap(() =>
                rescheduleReminders(personal).pipe(
                  Effect.andThen(rebuildMemberReminders(userId, canopy))
                )
              )
            )
          )
        })
      )
    )
