import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  CareScheduleRepository,
  type OverdueRecipientPlant,
} from '@lily/api/repositories/care-schedule.repository'
import { ownerKey } from '@lily/api/repositories/helpers/plant-owner'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  dispatchNow,
  recordNotification,
  scheduleDeferredCareNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { careContext } from '@lily/api/services/plants/helpers/care-context'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import {
  notificationSettingsOf,
  type UserNotificationSettings,
} from '@lily/api/services/plants/helpers/user-settings'
import { canopyPlantCapFrom } from '@lily/api/services/subscriptions/canopy-plant-cap'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import {
  AlreadySentTodayError,
  CareRemindersDisabledError,
  DEFAULT_TIMEZONE,
  isOnVacation,
  nowAsDate,
  type PlantOwner,
  pickNotificationTime,
  startOfTodayAsDate,
} from '@lily/shared'
import {
  Array,
  DateTime,
  Effect,
  Filter,
  Match,
  Option,
  Order,
  pipe,
  Random,
  Record,
} from 'effect'

const dueBeforeTheirOwnersDay = (
  plants: readonly OverdueRecipientPlant[],
  userTimezone: string
) =>
  Effect.gen(function* () {
    const canopyDayStarts = Record.fromEntries(
      yield* Effect.forEach(
        pipe(
          plants,
          Array.filter((p) => p.owner._tag === 'Canopy'),
          Array.dedupeWith((a, b) => ownerKey(a.owner) === ownerKey(b.owner))
        ),
        (p) =>
          Effect.map(
            careContext(p.owner),
            (context) =>
              [ownerKey(p.owner), startOfTodayAsDate(context.timezone)] as const
          )
      )
    )
    const userDayStart = startOfTodayAsDate(userTimezone)
    return Array.filter(plants, (p) =>
      DateTime.isLessThan(
        DateTime.makeUnsafe(p.overdueAt),
        DateTime.makeUnsafe(
          pipe(
            Record.get(canopyDayStarts, ownerKey(p.owner)),
            Option.getOrElse(() => userDayStart)
          )
        )
      )
    )
  })

const timezoneOf = (settings: UserNotificationSettings) =>
  pipe(
    Option.fromNullishOr(settings.timezone),
    Option.getOrElse(() => DEFAULT_TIMEZONE)
  )

const nudgeOverflow = (
  userId: string,
  settings: UserNotificationSettings,
  overflowCount: number
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const alreadySentNudge =
      yield* notificationRepo.hasNotificationOfTypeTodayForUser(
        userId,
        timezoneOf(settings),
        'resubscribe_nudge'
      )
    if (alreadySentNudge) return
    yield* recordNotification(
      'resubscribe_nudge',
      userId,
      { plantCount: overflowCount },
      settings.language,
      {}
    ).pipe(Effect.flatMap(dispatchNow))
  })

const capAudience = (
  userId: string,
  settings: UserNotificationSettings,
  plants: readonly OverdueRecipientPlant[],
  maxPlantsFor: (owner: PlantOwner) => number | null
) =>
  Effect.gen(function* () {
    const strictlyOverdue = yield* dueBeforeTheirOwnersDay(
      plants,
      timezoneOf(settings)
    )
    const sorted = Array.sort(
      strictlyOverdue,
      Order.mapInput(Order.Date, (p: OverdueRecipientPlant) => p.dateAdded)
    )
    const eligible = pipe(
      sorted,
      Array.groupBy((p) => ownerKey(p.owner)),
      Record.values,
      Array.flatMap((scope) =>
        pipe(
          Option.fromNullishOr(maxPlantsFor(scope[0].owner)),
          Option.match({
            onNone: () => scope,
            onSome: (cap) => Array.take(scope, cap),
          })
        )
      )
    )
    const overflowCount = Array.length(sorted) - Array.length(eligible)

    if (
      overflowCount > 0 &&
      settings.careReminders &&
      settings.tips &&
      !isOnVacation(settings, nowAsDate())
    ) {
      yield* nudgeOverflow(userId, settings, overflowCount)
    }

    return eligible
  })

export const remindRecipient = (
  recipientId: string,
  settings: UserNotificationSettings,
  plants: readonly OverdueRecipientPlant[]
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const scheduleRepo = yield* CareScheduleRepository

    if (!settings.careReminders) {
      return yield* new CareRemindersDisabledError({ userId: recipientId })
    }
    if (isOnVacation(settings, nowAsDate())) return 0

    const timezone = timezoneOf(settings)
    const alreadySent =
      yield* notificationRepo.hasNotificationOfTypeTodayForUser(
        recipientId,
        timezone,
        'overdue_reminder'
      )
    if (alreadySent) {
      return yield* new AlreadySentTodayError({ userId: recipientId })
    }

    // Morning-first: clamp to [0, 0.5) so the first window wins
    const randomValue = yield* Random.next
    const scheduledAt = yield* pickNotificationTime(
      recipientId,
      timezone,
      settings.doNotDisturb,
      settings.doNotDisturbStart,
      settings.doNotDisturbEnd,
      randomValue * 0.5
    )

    const plantIds = Array.map(plants, (p) => p.id)
    return yield* Effect.gen(function* () {
      const stillOverdue = yield* scheduleRepo.findOverduePlantIds(plantIds)
      yield* Effect.forEach(stillOverdue, (plantId) =>
        scheduleDeferredCareNotification({
          type: 'overdue_reminder',
          userId: recipientId,
          plantId,
          scheduledAt,
        })
      )
      return Array.length(stillOverdue)
    }).pipe(withReminderKeys(reminderKeysFor(plantIds)))
  }).pipe(
    Effect.withSpan('overdue-scheduler.remindRecipient', {
      attributes: { recipientId },
    })
  )

// Core effect: check for overdue plants and create reminder notifications
export const checkAndCreateOverdueReminders = Effect.gen(function* () {
  const scheduleRepo = yield* CareScheduleRepository
  const canopyRepo = yield* CanopyRepository
  const subRepo = yield* SubscriptionRepository
  const userRepo = yield* UserRepository

  yield* Effect.log('Running overdue reminder check...')

  const grouped = yield* scheduleRepo.findOverdueByUser()

  if (Record.isEmptyRecord(grouped)) return

  const canopyIds = pipe(
    Record.values(grouped),
    Array.flatten,
    Array.filterMap(
      Filter.fromPredicateOption((p) =>
        p.owner._tag === 'Canopy'
          ? Option.some(p.owner.canopyId)
          : Option.none()
      )
    ),
    Array.dedupe
  )
  const membersByCanopy = yield* canopyRepo.findMemberIdsByCanopyIds(canopyIds)

  const userIds = pipe(
    Record.values(membersByCanopy),
    Array.flatten,
    Array.appendAll(Record.keys(grouped)),
    Array.dedupe
  )
  const [subscriptions, allTiers] = yield* Effect.all([
    subRepo.findByUserIds(userIds),
    subRepo.getAllTiers(),
  ])

  const subByUserId = pipe(
    subscriptions,
    Array.groupBy((sub) => sub.userId),
    Record.map(Array.head)
  )
  const tierByName = pipe(
    allTiers,
    Array.groupBy((t): string => t.tier),
    Record.map((tiers) => pipe(Array.head(tiers), Option.getOrUndefined))
  )
  const freeTierMaxPlants = tierByName.free?.maxPlants ?? 5

  const maxPlantsOfUser = (userId: string): number | null =>
    pipe(
      Record.get(subByUserId, userId),
      Option.flatten,
      Option.filter(hasPremiumAccess),
      Option.match({
        onNone: () => freeTierMaxPlants,
        onSome: (sub) => tierByName[sub.tier]?.maxPlants ?? null,
      })
    )

  const maxPlantsOfCanopy = Record.map(membersByCanopy, (members) =>
    canopyPlantCapFrom(Array.map(members, maxPlantsOfUser), freeTierMaxPlants)
  )

  const maxPlantsFor = (owner: PlantOwner): number | null =>
    Match.value(owner).pipe(
      Match.tag('User', ({ userId }) => maxPlantsOfUser(userId)),
      Match.tag('Canopy', ({ canopyId }) =>
        pipe(
          Record.get(maxPlantsOfCanopy, canopyId),
          Option.getOrElse(() => freeTierMaxPlants)
        )
      ),
      Match.exhaustive
    )

  const settingsById = pipe(
    yield* userRepo.findByIds(
      pipe(
        Record.values(grouped),
        Array.flatten,
        Array.map((p) => p.recipientId),
        Array.appendAll(Record.keys(grouped)),
        Array.dedupe
      )
    ),
    Array.map((user) => [user.id, notificationSettingsOf(user)] as const),
    Record.fromEntries
  )
  const settingsOf = (userId: string) =>
    pipe(
      Record.get(settingsById, userId),
      Option.getOrElse(() => notificationSettingsOf(null))
    )

  const eligible = yield* Effect.forEach(
    Record.toEntries(grouped),
    ([userId, plants]) =>
      capAudience(userId, settingsOf(userId), plants, maxPlantsFor).pipe(
        Effect.catchTag('SqlError', (e) =>
          Effect.logWarning('[overdue-scheduler] Failed to cap user', {
            userId,
            error: String(e),
          }).pipe(Effect.as([]))
        )
      ),
    { concurrency: 10 }
  )

  const results = yield* Effect.forEach(
    Record.toEntries(
      Array.groupBy(Array.flatten(eligible), (p) => p.recipientId)
    ),
    ([recipientId, plants]) =>
      remindRecipient(recipientId, settingsOf(recipientId), plants).pipe(
        Effect.catchTags({
          CareRemindersDisabledError: (e) =>
            Effect.log('[overdue-scheduler] Skipped — reminders disabled', {
              userId: e.userId,
            }).pipe(Effect.as(0)),
          AlreadySentTodayError: (e) =>
            Effect.log('[overdue-scheduler] Skipped — already sent', {
              userId: e.userId,
            }).pipe(Effect.as(0)),
          DndWindowBlockedError: (e) =>
            Effect.log('[overdue-scheduler] Skipped — DND window', {
              userId: e.userId,
            }).pipe(Effect.as(0)),
          SqlError: (e) =>
            Effect.logWarning('[overdue-scheduler] Failed to remind user', {
              userId: recipientId,
              error: String(e),
            }).pipe(Effect.as(0)),
        })
      ),
    { concurrency: 10 }
  )

  const totalCreated = Array.reduce(results, 0, (acc, n) => acc + n)

  if (totalCreated > 0) {
    yield* Effect.log('Created overdue reminders', { count: totalCreated })
  }
}).pipe(Effect.withSpan('overdue-scheduler.check'))

export const startOverdueScheduler = createScheduler({
  name: 'overdue-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndCreateOverdueReminders,
})
