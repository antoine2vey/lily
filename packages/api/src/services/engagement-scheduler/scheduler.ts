import {
  EngagementRepository,
  type UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import {
  DEFAULT_TIMEZONE,
  daysAgoAsDate,
  daysSince,
  pickNotificationTime,
} from '@lily/shared'
import { Array, Data, Effect, Option, pipe, Random, Ref } from 'effect'

// Inactivity threshold: 7 days without care
const INACTIVITY_DAYS = 7
// Photo staleness threshold: 30 days without a photo
const PHOTO_STALENESS_DAYS = 30
// Milestone days since signup
const MILESTONES = [7, 30, 90, 180, 365] as const

// Dedup periods (in days)
const INACTIVITY_DEDUP_DAYS = 7
const PHOTO_DEDUP_DAYS = 30

class SkipUserError extends Data.TaggedError('SkipUserError')<{
  readonly reason: string
}> {}

// Resolve timezone from nullable user setting
const resolveTimezone = (tz: string | null): string =>
  Option.getOrElse(Option.fromNullable(tz), () => DEFAULT_TIMEZONE)

// Process inactivity nudges for all eligible users
export const processInactivityNudges = Effect.fn(
  'engagement-scheduler.inactivityNudges'
)(function* (usersWithTips: ReadonlyArray<UserWithSettings>) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository
  const created = yield* Ref.make(0)

  yield* Effect.forEach(
    usersWithTips,
    (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)

        // Dedup: skip if already sent in last 7 days
        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'inactivity_nudge',
          daysAgoAsDate(INACTIVITY_DEDUP_DAYS)
        )
        if (alreadySent) {
          return yield* new SkipUserError({ reason: 'already_sent' })
        }

        // Check last care date
        const lastCareDate = yield* engagementRepo.getLastCareDate(user.id)
        yield* pipe(
          Option.fromNullable(lastCareDate),
          Option.match({
            onNone: () => Effect.void,
            onSome: (date) =>
              daysSince(date) < INACTIVITY_DAYS
                ? new SkipUserError({ reason: 'recent_care' })
                : Effect.void,
          })
        )

        // Get plant count for personalized message
        const plantCount = yield* engagementRepo.getPlantCountForUser(user.id)
        if (plantCount === 0) {
          return yield* new SkipUserError({ reason: 'no_plants' })
        }

        const randomValue = yield* Random.next
        const scheduledAt = yield* pickNotificationTime(
          user.id,
          timezone,
          user.doNotDisturb,
          user.doNotDisturbStart,
          user.doNotDisturbEnd,
          randomValue
        )

        const { title, body } = buildSimpleContent(
          'inactivity_nudge',
          { plantCount },
          user.language
        )

        yield* notificationRepo.create({
          type: 'inactivity_nudge',
          title,
          body,
          scheduledAt,
          userId: user.id,
        })

        yield* Ref.update(created, (n) => n + 1)
      }).pipe(
        Effect.catchTags({
          SkipUserError: (e) =>
            Effect.log('[engagement-scheduler] Skipped user (inactivity)', {
              reason: e.reason,
              userId: user.id,
            }),
          DndWindowBlockedError: () =>
            Effect.log(
              '[engagement-scheduler] Skipped — DND window (inactivity)',
              { userId: user.id }
            ),
          SqlError: (e) =>
            Effect.logWarning(
              '[engagement-scheduler] Item failed (inactivity)',
              { userId: user.id, error: String(e) }
            ),
        })
      ),
    { concurrency: 10 }
  )

  const total = yield* Ref.get(created)
  if (total > 0) {
    yield* Effect.log('[engagement-scheduler] Created inactivity nudges', {
      count: total,
    })
  }
})

// Process photo reminders for plants without recent photos
export const processPhotoReminders = Effect.fn(
  'engagement-scheduler.photoReminders'
)(function* (usersWithTips: ReadonlyArray<UserWithSettings>) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository
  const created = yield* Ref.make(0)

  yield* Effect.forEach(
    usersWithTips,
    (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)

        const stalePlants = yield* engagementRepo.getPlantsWithoutRecentPhoto(
          user.id,
          daysAgoAsDate(PHOTO_STALENESS_DAYS)
        )

        if (Array.isEmptyReadonlyArray(stalePlants)) {
          return yield* new SkipUserError({ reason: 'no_stale_plants' })
        }

        const randomValue = yield* Random.next
        const scheduledAt = yield* pickNotificationTime(
          user.id,
          timezone,
          user.doNotDisturb,
          user.doNotDisturbStart,
          user.doNotDisturbEnd,
          randomValue
        )

        // Send one notification per stale plant (deduped per plant per month)
        yield* Effect.forEach(stalePlants, (plant) =>
          Effect.gen(function* () {
            const alreadySent =
              yield* engagementRepo.hasNotificationForPlantInPeriod(
                user.id,
                'photo_reminder',
                plant.plantId,
                daysAgoAsDate(PHOTO_DEDUP_DAYS)
              )
            if (alreadySent) {
              return yield* new SkipUserError({ reason: 'already_sent' })
            }

            const daysSincePhotoVal = pipe(
              Option.fromNullable(plant.lastPhotoAt),
              Option.match({
                onNone: () => PHOTO_STALENESS_DAYS,
                onSome: (date) => daysSince(date),
              })
            )

            const { title, body } = buildSimpleContent(
              'photo_reminder',
              {
                plantName: plant.plantName,
                daysSincePhoto: daysSincePhotoVal,
              },
              user.language
            )

            yield* notificationRepo.create({
              type: 'photo_reminder',
              title,
              body,
              scheduledAt,
              userId: user.id,
              plantId: plant.plantId,
            })

            yield* Ref.update(created, (n) => n + 1)
          }).pipe(
            Effect.catchTags({
              SkipUserError: (e) =>
                Effect.log('[engagement-scheduler] Skipped plant (photo)', {
                  reason: e.reason,
                  plantId: plant.plantId,
                  userId: user.id,
                }),
              SqlError: (e) =>
                Effect.logWarning(
                  '[engagement-scheduler] Plant failed (photo)',
                  {
                    plantId: plant.plantId,
                    userId: user.id,
                    error: String(e),
                  }
                ),
            })
          )
        )
      }).pipe(
        Effect.catchTags({
          SkipUserError: (e) =>
            Effect.log('[engagement-scheduler] Skipped user (photo)', {
              reason: e.reason,
              userId: user.id,
            }),
          DndWindowBlockedError: () =>
            Effect.log('[engagement-scheduler] Skipped — DND window (photo)', {
              userId: user.id,
            }),
          SqlError: (e) =>
            Effect.logWarning('[engagement-scheduler] Item failed (photo)', {
              userId: user.id,
              error: String(e),
            }),
        })
      ),
    { concurrency: 10 }
  )

  const total = yield* Ref.get(created)
  if (total > 0) {
    yield* Effect.log('[engagement-scheduler] Created photo reminders', {
      count: total,
    })
  }
})

// Process plant parent milestones
export const processPlantParentMilestones = Effect.fn(
  'engagement-scheduler.milestones'
)(function* (usersWithTips: ReadonlyArray<UserWithSettings>) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository
  const created = yield* Ref.make(0)

  yield* Effect.forEach(
    usersWithTips,
    (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)
        const daysSinceJoin = daysSince(user.createdAt)

        // Find matching milestone
        const milestone = yield* pipe(
          Array.findFirst(MILESTONES, (m) => m === daysSinceJoin),
          Option.match({
            onNone: () => new SkipUserError({ reason: 'no_milestone' }),
            onSome: Effect.succeed,
          })
        )

        // Dedup: check if we already sent this milestone
        // Use a long lookback (milestone value + 1 day) to prevent re-sends
        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'plant_parent_milestone',
          daysAgoAsDate(milestone + 1)
        )
        if (alreadySent) {
          return yield* new SkipUserError({ reason: 'already_sent' })
        }

        const randomValue = yield* Random.next
        const scheduledAt = yield* pickNotificationTime(
          user.id,
          timezone,
          user.doNotDisturb,
          user.doNotDisturbStart,
          user.doNotDisturbEnd,
          randomValue
        )

        const { title, body } = buildSimpleContent(
          'plant_parent_milestone',
          { daysSinceJoin: milestone },
          user.language
        )

        yield* notificationRepo.create({
          type: 'plant_parent_milestone',
          title,
          body,
          scheduledAt,
          userId: user.id,
        })

        yield* Ref.update(created, (n) => n + 1)
      }).pipe(
        Effect.catchTags({
          SkipUserError: (e) =>
            Effect.log('[engagement-scheduler] Skipped user (milestone)', {
              reason: e.reason,
              userId: user.id,
            }),
          DndWindowBlockedError: () =>
            Effect.log(
              '[engagement-scheduler] Skipped — DND window (milestone)',
              { userId: user.id }
            ),
          SqlError: (e) =>
            Effect.logWarning(
              '[engagement-scheduler] Item failed (milestone)',
              { userId: user.id, error: String(e) }
            ),
        })
      ),
    { concurrency: 10 }
  )

  const total = yield* Ref.get(created)
  if (total > 0) {
    yield* Effect.log(
      '[engagement-scheduler] Created milestone notifications',
      { count: total }
    )
  }
})

// Core effect: run all engagement checks
export const checkAndCreateEngagementNotifications = Effect.gen(function* () {
  yield* Effect.log('Running engagement notification check...')

  const engagementRepo = yield* EngagementRepository
  const usersWithTips = yield* engagementRepo.getUsersWithTipsEnabled()

  if (Array.isEmptyReadonlyArray(usersWithTips)) return

  yield* Effect.all([
    processInactivityNudges(usersWithTips),
    processPhotoReminders(usersWithTips),
    processPlantParentMilestones(usersWithTips),
  ])
}).pipe(Effect.withSpan('engagement-scheduler.check'))

export const startEngagementScheduler = createScheduler({
  name: 'engagement-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndCreateEngagementNotifications,
})
