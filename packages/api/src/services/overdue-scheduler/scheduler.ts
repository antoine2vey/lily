import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  scheduleDeferredCareNotification,
  scheduleSimpleNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { getUserNotificationSettings } from '@lily/api/services/plants/helpers/user-settings'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import {
  AlreadySentTodayError,
  CareRemindersDisabledError,
  DEFAULT_TIMEZONE,
  type OverduePlant,
  pickNotificationTime,
  startOfTodayAsDate,
} from '@lily/shared'
import { Array, Effect, Option, Order, pipe, Random, Record } from 'effect'

// Process a single user's overdue plants — fails with skip errors when the
// user should not receive a notification.
export const processUserOverdueReminders = (
  userId: string,
  plants: readonly OverduePlant[],
  maxPlants: number | null
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const delegationRepo = yield* DelegationRepository

    // Check user settings
    const settings = yield* getUserNotificationSettings(userId)

    if (!settings.careReminders) {
      return yield* new CareRemindersDisabledError({ userId })
    }

    const timezone = pipe(
      Option.fromNullable(settings.timezone),
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

    if (Array.isEmptyReadonlyArray(strictlyOverdue)) return 0

    // Sort by dateAdded ascending (oldest first), cap when tier has a plant limit
    const sorted = Array.sort(
      strictlyOverdue,
      Order.mapInput(Order.Date, (p: OverduePlant) => p.dateAdded)
    )
    const eligible = maxPlants === null ? sorted : Array.take(sorted, maxPlants)
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

    // Create one notification per eligible plant, all sharing the same scheduledAt
    yield* Effect.forEach(eligible, (plant) =>
      Effect.gen(function* () {
        // Route to caretaker when delegated
        const caretakerId = yield* delegationRepo.findActiveCaretakerForPlant(
          plant.id
        )
        const targetUserId = pipe(
          Option.fromNullable(caretakerId),
          Option.getOrElse(() => userId)
        )

        yield* scheduleDeferredCareNotification({
          type: 'overdue_reminder',
          userId: targetUserId,
          plantId: plant.id,
          scheduledAt,
        })
      })
    )

    // Send a daily nudge when free-tier plants overflow the cap
    if (overflowCount > 0) {
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

    return Array.length(eligible)
  }).pipe(
    Effect.withSpan('overdue-scheduler.processUser', { attributes: { userId } })
  )

// Core effect: check for overdue plants and create reminder notifications
export const checkAndCreateOverdueReminders = Effect.gen(function* () {
  const scheduleRepo = yield* CareScheduleRepository
  const subRepo = yield* SubscriptionRepository

  yield* Effect.log('Running overdue reminder check...')

  // Single query: fetch plants overdue for any care type, grouped by userId
  const grouped = yield* scheduleRepo.findOverdueByUser()

  if (Record.isEmptyRecord(grouped)) return

  // Batch-fetch subscriptions and tier configs (3 queries total)
  const userIds = Record.keys(grouped)
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
    Array.groupBy((t) => t.tier),
    Record.map((tiers) => pipe(Array.head(tiers), Option.getOrUndefined))
  )
  const freeTierMaxPlants = tierByName.free?.maxPlants ?? 5

  const resolveMaxPlants = (userId: string): number | null =>
    pipe(
      Record.get(subByUserId, userId),
      Option.flatten,
      Option.filter(hasPremiumAccess),
      Option.match({
        onNone: () => freeTierMaxPlants,
        onSome: (sub) => tierByName[sub.tier]?.maxPlants ?? null,
      })
    )

  // Process each user group, handling skip errors via catchTags
  const results = yield* Effect.forEach(
    Record.toEntries(grouped),
    ([userId, plants]) =>
      processUserOverdueReminders(
        userId,
        plants,
        resolveMaxPlants(userId)
      ).pipe(
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
