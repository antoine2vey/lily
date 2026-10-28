import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  type ScheduleContext,
  scheduleReminderForRecipient,
} from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { Array, DateTime, Effect, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Give one member their own rows for the Canopy plants they can now hear
 * about (after joining, or unmuting one plant), without touching anyone
 * else's rows. Past due dates stay with the overdue digest.
 */
export const rebuildMemberReminders = (
  userId: string,
  plantIds?: ReadonlyArray<string>
): Effect.Effect<void, SqlError, ScheduleContext | CareScheduleRepository> =>
  Effect.gen(function* () {
    const scheduleRepo = yield* CareScheduleRepository
    const notificationRepo = yield* NotificationRepository
    const nowMs = DateTime.toEpochMillis(DateTime.nowUnsafe())
    const rows = pipe(
      yield* scheduleRepo.findByOwnerWithPlant(userId),
      Array.filter(
        (row): row is typeof row & { schedule: { nextCareAt: Date } } =>
          row.plant.owner._tag === 'Canopy' &&
          (plantIds === undefined || Array.contains(plantIds, row.plant.id)) &&
          row.schedule.nextCareAt !== null &&
          row.schedule.nextCareAt.getTime() > nowMs
      )
    )
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
  }).pipe(
    Effect.withSpan('rebuildMemberReminders', {
      attributes: { 'user.id': userId },
    })
  )
