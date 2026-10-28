import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  type CreateNotificationData,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import {
  adjustForDoNotDisturb,
  calculateScheduledAt,
} from '@lily/api/services/notifications/timezone-scheduler'
import { careContext } from '@lily/api/services/plants/helpers/care-context'
import {
  type ReminderPlant,
  reminderRecipients,
} from '@lily/api/services/plants/helpers/reminder-recipients'
import { getUserNotificationSettings } from '@lily/api/services/plants/helpers/user-settings'
import { isOnVacation, nowAsDate, type PlantOwner } from '@lily/shared'
import { Array, DateTime, Effect, Match, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type CareReminderType =
  | 'watering_reminder'
  | 'fertilization_reminder'
  | 'misting_reminder'
  | 'repotting_reminder'

export interface ScheduleCareReminderParams {
  plant: ReminderPlant & { readonly remindersEnabled: boolean }
  type: CareReminderType
  scheduledDate: Date
}

export type ScheduleContext =
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CanopyRepository
  | SqlClient.SqlClient

const zoneOf = (timezone: string | null) =>
  pipe(
    Option.fromNullishOr(timezone),
    Option.flatMap(DateTime.zoneMakeNamed),
    Option.getOrElse(() => DateTime.zoneMakeNamedUnsafe('UTC'))
  )

const sameCalendarDayFor = (
  scheduledDate: Date,
  contextTimezone: string,
  memberTimezone: string | null
): Date => {
  const { year, month, day } = DateTime.toParts(
    DateTime.setZone(
      DateTime.makeUnsafe(scheduledDate),
      zoneOf(contextTimezone)
    )
  )
  return DateTime.toDateUtc(
    DateTime.makeZonedUnsafe(
      { year, month, day, hour: 12 },
      { timeZone: zoneOf(memberTimezone), adjustForTimeZone: true }
    )
  )
}

export type ReminderDay = (memberTimezone: string | null) => Date

export const reminderDayFor = (
  owner: PlantOwner,
  scheduledDate: Date
): Effect.Effect<ReminderDay, SqlError, UserRepository | CanopyRepository> =>
  pipe(
    Match.value(owner),
    Match.tag('User', () => Effect.succeed<ReminderDay>(() => scheduledDate)),
    Match.tag('Canopy', (canopyOwner) =>
      Effect.map(
        careContext(canopyOwner),
        (context): ReminderDay =>
          (memberTimezone) =>
            sameCalendarDayFor(scheduledDate, context.timezone, memberTimezone)
      )
    ),
    Match.exhaustive
  )

const reminderRowFor = (
  recipientId: string,
  params: ScheduleCareReminderParams,
  reminderDay: ReminderDay
): Effect.Effect<
  Option.Option<CreateNotificationData>,
  SqlError,
  UserRepository
> =>
  Effect.gen(function* () {
    const settings = yield* getUserNotificationSettings(recipientId)
    if (!settings.careReminders || isOnVacation(settings, nowAsDate())) {
      return Option.none()
    }
    const scheduledAt = yield* calculateScheduledAt(
      reminderDay(settings.timezone),
      settings.timezone,
      settings.preferredTime
    )
    const finalScheduledAt = settings.doNotDisturb
      ? yield* adjustForDoNotDisturb(
          scheduledAt,
          settings.timezone,
          settings.doNotDisturbStart,
          settings.doNotDisturbEnd
        )
      : scheduledAt
    return Option.some({
      type: params.type,
      scheduledAt: finalScheduledAt,
      userId: recipientId,
      plantId: params.plant.id,
    })
  })

export const scheduleCareReminder = (
  params: ScheduleCareReminderParams
): Effect.Effect<void, SqlError, ScheduleContext> =>
  Effect.gen(function* () {
    if (!params.plant.remindersEnabled) {
      return
    }
    const [recipients, reminderDay] = yield* Effect.all([
      reminderRecipients(params.plant),
      reminderDayFor(params.plant.owner, params.scheduledDate),
    ])
    const rows = Array.getSomes(
      yield* Effect.forEach(recipients, (recipientId) =>
        reminderRowFor(recipientId, params, reminderDay)
      )
    )
    const notificationRepo = yield* NotificationRepository
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.andThen(
        notificationRepo.deletePendingByPlantAndType(
          params.plant.id,
          params.type
        ),
        notificationRepo.createPendingMany(rows)
      )
    )
  })

export const scheduleReminderForRecipient = (
  recipientId: string,
  params: ScheduleCareReminderParams
): Effect.Effect<void, SqlError, ScheduleContext> =>
  Effect.gen(function* () {
    if (!params.plant.remindersEnabled) {
      return
    }
    const reminderDay = yield* reminderDayFor(
      params.plant.owner,
      params.scheduledDate
    )
    const row = yield* reminderRowFor(recipientId, params, reminderDay)
    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.createPendingMany(Array.fromOption(row))
  })
