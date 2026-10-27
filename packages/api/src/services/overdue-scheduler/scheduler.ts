import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  CareScheduleRepository,
  type OverdueRecipientPlant,
} from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  scheduleDeferredCareNotification,
  scheduleSimpleNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { getUserNotificationSettings } from '@lily/api/services/plants/helpers/user-settings'
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
  Effect,
  Filter,
  Match,
  Option,
  Order,
  pipe,
  Random,
  Record,
} from 'effect'

const ownerKey = (owner: PlantOwner): string =>
  Match.value(owner).pipe(
    Match.tag('User', ({ userId }) => `user:${userId}`),
    Match.tag('Canopy', ({ canopyId }) => `canopy:${canopyId}`),
    Match.exhaustive
  )

export const processUserOverdueReminders = (
  userId: string,
  plants: readonly OverdueRecipientPlant[],
  maxPlantsFor: (owner: PlantOwner) => number | null
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const delegationRepo = yield* DelegationRepository

    // Check user settings
    const settings = yield* getUserNotificationSettings(userId)

    if (!settings.careReminders) {
      return yield* new CareRemindersDisabledError({ userId })
    }

    const recipientOnVacation = isOnVacation(settings, nowAsDate())

    const timezone = pipe(
      Option.fromNullishOr(settings.timezone),
      Option.getOrElse(() => DEFAULT_TIMEZONE)
    )

    // Dedup: skip if already sent today
    const alreadySent =
      yield* notificationRepo.hasNotificationOfTypeTodayForUser(
        userId,
        timezone,
        'overdue_reminder'
      )

    if (alreadySent) {
      return yield* new AlreadySentTodayError({ userId })
    }

    // Precision filter: only keep plants strictly overdue (before start of today in user's tz)
    const todayStart = startOfTodayAsDate(timezone)
    const strictlyOverdue = Array.filter(
      plants,
      (p) => p.overdueAt.getTime() < todayStart.getTime()
    )

    if (Array.isReadonlyArrayEmpty(strictlyOverdue)) return 0

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

    // Pick the earliest available window (morning-first) for overdue reminders
    // so users are notified first thing in the morning, not randomly in the evening
    const randomValue = yield* Random.next
    const scheduledAt = yield* pickNotificationTime(
      userId,
      timezone,
      settings.doNotDisturb,
      settings.doNotDisturbStart,
      settings.doNotDisturbEnd,
      randomValue * 0.5 // clamp to [0, 0.5) to always prefer morning window
    )

    const routed = yield* Effect.forEach(eligible, (plant) =>
      Match.value(plant.owner).pipe(
        Match.tag('Canopy', () => Effect.succeed(null)),
        Match.tag('User', () =>
          delegationRepo.findActiveCaretakerForPlant(plant.id)
        ),
        Match.exhaustive,
        Effect.map((caretakerId) => ({ plant, caretakerId }))
      )
    )

    // One settings fetch per distinct caretaker to check their vacation
    const caretakerIds = pipe(
      routed,
      Array.filterMap(
        Filter.fromPredicateOption(({ caretakerId }) =>
          Option.fromNullishOr(caretakerId)
        )
      ),
      Array.dedupe
    )
    const caretakerOnVacation = Record.fromEntries(
      yield* Effect.forEach(caretakerIds, (caretakerId) =>
        getUserNotificationSettings(caretakerId).pipe(
          Effect.map(
            (caretakerSettings) =>
              [
                caretakerId,
                isOnVacation(caretakerSettings, nowAsDate()),
              ] as const
          )
        )
      )
    )

    const deliverable = Array.filter(routed, ({ caretakerId }) =>
      pipe(
        Option.fromNullishOr(caretakerId),
        Option.match({
          onNone: () => !recipientOnVacation,
          onSome: (id) =>
            pipe(
              Record.get(caretakerOnVacation, id),
              Option.getOrElse(() => false),
              (onVacation) => !onVacation
            ),
        })
      )
    )

    // Create one notification per deliverable plant, sharing the same scheduledAt
    yield* Effect.forEach(deliverable, ({ plant, caretakerId }) =>
      scheduleDeferredCareNotification({
        type: 'overdue_reminder',
        userId: pipe(
          Option.fromNullishOr(caretakerId),
          Option.getOrElse(() => userId)
        ),
        plantId: plant.id,
        scheduledAt,
      })
    )

    if (overflowCount > 0 && !recipientOnVacation) {
      const alreadySentNudge =
        yield* notificationRepo.hasNotificationOfTypeTodayForUser(
          userId,
          timezone,
          'resubscribe_nudge'
        )
      if (!alreadySentNudge) {
        yield* scheduleSimpleNotification(
          'resubscribe_nudge',
          userId,
          { plantCount: overflowCount },
          settings.language
        )
      }
    }

    return Array.length(deliverable)
  }).pipe(
    Effect.withSpan('overdue-scheduler.processUser', { attributes: { userId } })
  )

// Core effect: check for overdue plants and create reminder notifications
export const checkAndCreateOverdueReminders = Effect.gen(function* () {
  const scheduleRepo = yield* CareScheduleRepository
  const canopyRepo = yield* CanopyRepository
  const subRepo = yield* SubscriptionRepository

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

  // Process each user group, handling skip errors via catchTags
  const results = yield* Effect.forEach(
    Record.toEntries(grouped),
    ([userId, plants]) =>
      processUserOverdueReminders(userId, plants, maxPlantsFor).pipe(
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
            Effect.logWarning('[overdue-scheduler] Failed to process user', {
              userId,
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
