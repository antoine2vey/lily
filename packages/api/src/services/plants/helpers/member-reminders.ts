import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { careContext } from '@lily/api/services/plants/helpers/care-context'
import {
  reminderRowForRecipient,
  type ScheduleContext,
} from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { startOfDay } from '@lily/shared'
import { Array, DateTime, Effect, Option, Order, Predicate, pipe } from 'effect'
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

const reminderLockOrder = Order.mapInput(
  Order.String,
  (reminder: {
    readonly plant: { readonly id: string }
    readonly type: string
  }) => `${reminder.plant.id}:${reminder.type}`
)

const alreadyRemindedToday =
  (
    sentToday: ReadonlyArray<{
      readonly plantId: string | null
      readonly type: string
    }>,
    dayStart: DateTime.DateTime
  ) =>
  (reminder: {
    readonly plant: { readonly id: string }
    readonly type: string
    readonly scheduledDate: Date
  }) =>
    DateTime.isLessThan(
      DateTime.makeUnsafe(reminder.scheduledDate),
      DateTime.add(dayStart, { days: 1 })
    ) &&
    Array.some(
      sentToday,
      (sent) =>
        sent.plantId === reminder.plant.id && sent.type === reminder.type
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
    const dayStart = startOfDay(DateTime.nowUnsafe(), timezone)
    const sentToday = yield* notificationRepo.findSentSince(
      userId,
      DateTime.toDateUtc(dayStart)
    )
    const reminders = pipe(
      Array.filter(canopyRows, isDueFrom(dayStart)),
      Array.map((row) => ({
        plant: row.plant,
        type: `${row.schedule.careType}_reminder` as const,
        scheduledDate: row.schedule.nextCareAt,
      })),
      Array.filter(Predicate.not(alreadyRemindedToday(sentToday, dayStart))),
      Array.sort(reminderLockOrder)
    )
    const rows = Array.getSomes(
      yield* Effect.forEach(reminders, (reminder) =>
        reminderRowForRecipient(userId, reminder)
      )
    )
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* Effect.forEach(
          reminders,
          (reminder) =>
            Effect.andThen(
              notificationRepo.lockPlantReminderInTransaction(
                reminder.plant.id,
                reminder.type
              ),
              notificationRepo.deleteUndeliveredByUserPlantAndType(
                userId,
                reminder.plant.id,
                reminder.type
              )
            ),
          { discard: true }
        )
        yield* notificationRepo.createPendingMany(rows)
      })
    )
  }).pipe(
    Effect.withSpan('rebuildMemberReminders', {
      attributes: { 'user.id': userId },
    })
  )
