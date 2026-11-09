import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  CareScheduleRepository,
  type CareScheduleRow,
} from '@lily/api/repositories/care-schedule.repository'
import {
  NotificationRepository,
  ReminderGuard,
  type ReminderReplacement,
} from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantRow,
} from '@lily/api/repositories/plant.repository'
import {
  heardBy,
  RecipientRepository,
} from '@lily/api/repositories/recipient.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  adjustForDoNotDisturb,
  calculateScheduledAt,
  decodeDndBounds,
} from '@lily/api/services/notifications/timezone-scheduler'
import { careContext } from '@lily/api/services/plants/helpers/care-context'
import {
  CARE_REMINDER_TYPES,
  type CareReminderType,
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import {
  notificationSettingsOf,
  type UserNotificationSettings,
} from '@lily/api/services/plants/helpers/user-settings'
import { isOnVacation, nowAsDate, startOfDay } from '@lily/shared'
import {
  Array,
  Data,
  DateTime,
  Effect,
  Filter,
  Match,
  Option,
  pipe,
  Record,
} from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type ReminderContext =
  | NotificationRepository
  | UserRepository
  | RecipientRepository
  | CanopyRepository
  | PlantRepository
  | CareScheduleRepository
  | SqlClient.SqlClient

type Scope = Data.TaggedEnum<{
  AllRecipients: {}
  OnlyMember: { readonly userId: string }
}>
const Scope = Data.taggedEnum<Scope>()

interface Policy {
  readonly personalWindow: 'any' | 'future'
  readonly cleanup: 'keys' | 'plant'
}

const zoneOf = (timezone: string | null) =>
  pipe(
    Option.fromNullishOr(timezone),
    Option.flatMap(DateTime.zoneMakeNamed),
    Option.getOrElse(() => DateTime.zoneMakeNamedUnsafe('UTC'))
  )

const sameCalendarDayFor = (
  dueDate: Date,
  canopyTimezone: string,
  memberTimezone: string | null
): Date => {
  const { year, month, day } = DateTime.toParts(
    DateTime.setZone(DateTime.makeUnsafe(dueDate), zoneOf(canopyTimezone))
  )
  return DateTime.toDateUtc(
    DateTime.makeZonedUnsafe(
      { year, month, day, hour: 12 },
      { timeZone: zoneOf(memberTimezone), adjustForTimeZone: true }
    )
  )
}

interface Due {
  readonly day: (memberTimezone: string | null) => Date
  readonly guard: ReminderGuard
}

const dueOf = (
  plant: PlantRow,
  next: Date,
  policy: Policy,
  canopyZones: Record.ReadonlyRecord<string, string>
): Option.Option<Due> =>
  Match.value(plant.owner).pipe(
    Match.tag('User', () =>
      Option.some({
        day: () => next,
        guard:
          policy.personalWindow === 'any' ||
          DateTime.isGreaterThan(
            DateTime.makeUnsafe(next),
            DateTime.nowUnsafe()
          )
            ? ReminderGuard.Always()
            : ReminderGuard.ReplacesUndelivered(),
      })
    ),
    Match.tag('Canopy', ({ canopyId }) => {
      const zone = pipe(
        Record.get(canopyZones, canopyId),
        Option.getOrElse(() => 'UTC')
      )
      const dayStart = startOfDay(DateTime.nowUnsafe(), zone)
      const due = DateTime.makeUnsafe(next)
      return DateTime.isLessThan(due, dayStart)
        ? Option.none()
        : Option.some({
            day: (memberTimezone: string | null) =>
              sameCalendarDayFor(next, zone, memberTimezone),
            guard: DateTime.isLessThan(due, DateTime.add(dayStart, { days: 1 }))
              ? ReminderGuard.NotRemindedSince({
                  since: DateTime.toDateUtc(dayStart),
                })
              : ReminderGuard.Always(),
          })
    }),
    Match.exhaustive
  )

const rowFor = (
  recipientId: string,
  settings: UserNotificationSettings,
  plant: PlantRow,
  type: CareReminderType,
  due: Due
) =>
  Effect.gen(function* () {
    const scheduledAt = yield* calculateScheduledAt(
      due.day(settings.timezone),
      settings.timezone,
      settings.preferredTime
    )
    return {
      type,
      scheduledAt: settings.doNotDisturb
        ? yield* decodeDndBounds(
            settings.doNotDisturbStart,
            settings.doNotDisturbEnd
          ).pipe(
            Effect.annotateLogs({ userId: recipientId }),
            Effect.flatMap((bounds) =>
              adjustForDoNotDisturb(scheduledAt, settings.timezone, bounds)
            )
          )
        : scheduledAt,
      userId: recipientId,
      plantId: plant.id,
      guard: due.guard,
    }
  })

const nextCareOf = (
  schedules: ReadonlyArray<CareScheduleRow>,
  plantId: string,
  type: CareReminderType
) =>
  pipe(
    Array.findFirst(
      schedules,
      (s) => s.plantId === plantId && `${s.careType}_reminder` === type
    ),
    Option.flatMap((s) => Option.fromNullishOr(s.nextCareAt))
  )

const recipientsOf = (plants: ReadonlyArray<PlantRow>, scope: Scope) =>
  Effect.gen(function* () {
    const audience = yield* Effect.flatMap(RecipientRepository, (repo) =>
      repo.audienceOf(Array.map(plants, (p) => p.id))
    )
    return Scope.$match(scope, {
      AllRecipients: () =>
        Array.map(
          plants,
          (plant) => [plant, heardBy(audience, plant.id)] as const
        ),
      OnlyMember: ({ userId }) =>
        Array.filterMap(
          plants,
          Filter.fromPredicateOption((plant: PlantRow) =>
            plant.owner._tag === 'Canopy'
              ? Option.some([
                  plant,
                  Array.filter(
                    heardBy(audience, plant.id),
                    (id) => id === userId
                  ),
                ] as const)
              : Option.none()
          )
        ),
    })
  })

const reconcile = (
  plantIds: ReadonlyArray<string>,
  types: ReadonlyArray<CareReminderType>,
  scope: Scope,
  policy: Policy
): Effect.Effect<void, SqlError, ReminderContext> =>
  withReminderKeys(reminderKeysFor(plantIds, types))(
    Effect.gen(function* () {
      const plantRepo = yield* PlantRepository
      const scheduleRepo = yield* CareScheduleRepository
      const userRepo = yield* UserRepository
      const notificationRepo = yield* NotificationRepository
      const plants = yield* plantRepo.findByIdsForKeyShare(plantIds)
      const schedules = yield* scheduleRepo.findByPlantIds(
        Array.map(plants, (p) => p.id)
      )
      const recipients = yield* recipientsOf(plants, scope)
      const users = yield* userRepo.findByIdsForShare(
        Array.dedupe(Array.flatMap(recipients, ([, ids]) => ids))
      )
      const settingsOf = (userId: string) =>
        notificationSettingsOf(
          Array.findFirst(users, (u) => u.id === userId).pipe(Option.getOrNull)
        )
      const canopyZones = Record.fromEntries(
        yield* Effect.forEach(
          Array.dedupe(
            Array.filterMap(
              plants,
              Filter.fromPredicateOption((p: PlantRow) =>
                p.owner._tag === 'Canopy'
                  ? Option.some(p.owner.canopyId)
                  : Option.none()
              )
            )
          ),
          (canopyId) =>
            Effect.map(
              careContext({ _tag: 'Canopy', canopyId }),
              (context) => [canopyId, context.timezone] as const
            )
        )
      )
      const now = nowAsDate()
      const rows = yield* Effect.forEach(
        Array.filter(
          recipients,
          ([plant]) => plant.diedAt === null && plant.remindersEnabled
        ),
        ([plant, recipientIds]) =>
          Effect.forEach(types, (type) =>
            pipe(
              nextCareOf(schedules, plant.id, type),
              Option.flatMap((next) => dueOf(plant, next, policy, canopyZones)),
              Option.match({
                onNone: () => Effect.succeed([]),
                onSome: (due) =>
                  Effect.forEach(
                    Array.filter(recipientIds, (recipientId) => {
                      const settings = settingsOf(recipientId)
                      return (
                        settings.careReminders && !isOnVacation(settings, now)
                      )
                    }),
                    (recipientId) =>
                      rowFor(
                        recipientId,
                        settingsOf(recipientId),
                        plant,
                        type,
                        due
                      )
                  ),
              })
            )
          ).pipe(Effect.map(Array.flatten))
      ).pipe(Effect.map(Array.flatten))
      const replacement: ReminderReplacement = {
        onlyUserId: Scope.$match(scope, {
          AllRecipients: () => null,
          OnlyMember: ({ userId }) => userId,
        }),
        plants: Array.map(recipients, ([plant, recipientIds]) => ({
          plantId: plant.id,
          types,
          recipientIds,
          plantWide: policy.cleanup === 'plant',
        })),
        rows,
      }
      yield* notificationRepo.replaceReminders(replacement)
    })
  )

export const reconcileCareReminder = (
  plantId: string,
  type: CareReminderType
): Effect.Effect<void, SqlError, ReminderContext> =>
  reconcile([plantId], [type], Scope.AllRecipients(), {
    personalWindow: 'any',
    cleanup: 'keys',
  }).pipe(
    Effect.withSpan('reconcileCareReminder', {
      attributes: { 'plant.id': plantId, type },
    })
  )

export const rescheduleReminders = (
  plantIds: ReadonlyArray<string>
): Effect.Effect<void, SqlError, ReminderContext> =>
  reconcile(plantIds, CARE_REMINDER_TYPES, Scope.AllRecipients(), {
    personalWindow: 'future',
    cleanup: 'plant',
  }).pipe(Effect.withSpan('rescheduleReminders'))

export const canopyPlantIdsOf = (userId: string) =>
  Effect.gen(function* () {
    const canopyRepo = yield* CanopyRepository
    const membership = yield* canopyRepo.findMembershipByUser(userId)
    return membership === null
      ? []
      : yield* canopyRepo.findPlantIdsOfCanopy(membership.canopyId)
  })

export const rebuildMemberReminders = (
  userId: string,
  plantIds?: ReadonlyArray<string>
): Effect.Effect<void, SqlError, ReminderContext> =>
  Effect.gen(function* () {
    const ids = yield* Option.match(Option.fromNullishOr(plantIds), {
      onNone: () => canopyPlantIdsOf(userId),
      onSome: Effect.succeed,
    })
    if (Array.isReadonlyArrayEmpty(ids)) return
    yield* reconcile(ids, CARE_REMINDER_TYPES, Scope.OnlyMember({ userId }), {
      personalWindow: 'future',
      cleanup: 'keys',
    })
  }).pipe(
    Effect.withSpan('rebuildMemberReminders', {
      attributes: { 'user.id': userId },
    })
  )
