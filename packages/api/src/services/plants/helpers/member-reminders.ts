import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { careContext } from '@lily/api/services/plants/helpers/care-context'
import {
  type ScheduleContext,
  scheduleReminderForRecipient,
} from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { startOfDay } from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const isDueFrom =
  (dayStart: DateTime.DateTime) =>
  <R extends { schedule: { nextCareAt: Date | null } }>(
    row: R
  ): row is R & { schedule: { nextCareAt: Date } } =>
    pipe(
      Option.fromNullishOr(row.schedule.nextCareAt),
      Option.exists((next) =>
        DateTime.isGreaterThanOrEqualTo(DateTime.makeUnsafe(next), dayStart)
      )
    )

export const rebuildMemberReminders = (
  userId: string,
  plantIds?: ReadonlyArray<string>
): Effect.Effect<void, SqlError, ScheduleContext | CareScheduleRepository> =>
  Effect.gen(function* () {
    const scheduleRepo = yield* CareScheduleRepository
    const notificationRepo = yield* NotificationRepository
    const sql = yield* SqlClient.SqlClient
    const canopyRows = Array.filter(
      yield* scheduleRepo.findByOwnerWithPlant(userId),
      (row) =>
        row.plant.owner._tag === 'Canopy' &&
        (plantIds === undefined || Array.contains(plantIds, row.plant.id))
    )
    const first = Array.head(canopyRows)
    if (Option.isNone(first)) return
    const { timezone } = yield* careContext(first.value.plant.owner)
    const rows = Array.filter(
      canopyRows,
      isDueFrom(startOfDay(DateTime.nowUnsafe(), timezone))
    )
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* Effect.forEach(
          Array.dedupe(Array.map(rows, (row) => row.plant.id)),
          (plantId) =>
            notificationRepo.deleteUndeliveredByUserAndPlant(userId, plantId),
          { discard: true }
        )
        yield* Effect.forEach(
          rows,
          (row) =>
            scheduleReminderForRecipient(userId, {
              plant: row.plant,
              type: `${row.schedule.careType}_reminder` as const,
              scheduledDate: row.schedule.nextCareAt,
            }),
          { discard: true }
        )
      })
    )
  }).pipe(
    Effect.withSpan('rebuildMemberReminders', {
      attributes: { 'user.id': userId },
    })
  )
