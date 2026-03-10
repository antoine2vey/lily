import { EngagementRepository } from '@lily/api/repositories/engagement.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import {
  DEFAULT_TIMEZONE,
  DndWindowBlockedError,
  pickOverdueNotificationTime,
} from '@lily/shared'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'
import type { DurationInput } from 'effect/Duration'

// Check every hour (same cadence as overdue scheduler)
const POLL_INTERVAL: DurationInput = '1 hour'

// Inactivity threshold: 7 days without care
const INACTIVITY_DAYS = 7
// Photo staleness threshold: 30 days without a photo
const PHOTO_STALENESS_DAYS = 30
// Milestone days since signup
const MILESTONES = [7, 30, 90, 180, 365] as const

// Dedup periods (in days)
const INACTIVITY_DEDUP_DAYS = 7
const PHOTO_DEDUP_DAYS = 30

const daysAgo = (days: number): Date => {
  const dt = DateTime.unsafeNow()
  const shifted = DateTime.subtractDuration(dt, Duration.days(days))
  return DateTime.toDateUtc(shifted)
}

const daysSince = (date: Date): number => {
  const now = DateTime.unsafeNow()
  const then = DateTime.unsafeMake(date)
  const distMs = DateTime.distance(then, now)
  return Math.floor(Duration.toMillis(Duration.millis(distMs)) / 86_400_000)
}

// Process inactivity nudges for all eligible users
export const processInactivityNudges = Effect.gen(function* () {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  const usersWithTips = yield* engagementRepo.getUsersWithTipsEnabled()
  let created = 0

  yield* Effect.forEach(
    usersWithTips,
    (user) =>
      Effect.gen(function* () {
        const timezone = pipe(
          Option.fromNullable(user.timezone),
          Option.getOrElse(() => DEFAULT_TIMEZONE)
        )

        // Dedup: skip if already sent in last 7 days
        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'inactivity_nudge',
          daysAgo(INACTIVITY_DEDUP_DAYS)
        )
        if (alreadySent) return

        // Check last care date
        const lastCareDate = yield* engagementRepo.getLastCareDate(user.id)
        if (lastCareDate) {
          const daysSinceLastCare = daysSince(lastCareDate)
          if (daysSinceLastCare < INACTIVITY_DAYS) return
        }
        // If no care date at all, also send (user may have never cared)

        // Get plant count for personalized message
        const plantCount = yield* engagementRepo.getPlantCountForUser(user.id)
        if (plantCount === 0) return // No plants, no nudge

        // Pick random time in morning/evening window
        const scheduledAt = yield* pipe(
          pickOverdueNotificationTime(
            timezone,
            user.doNotDisturb,
            user.doNotDisturbStart,
            user.doNotDisturbEnd,
            Math.random()
          ),
          Option.match({
            onNone: () => new DndWindowBlockedError({ userId: user.id }),
            onSome: Effect.succeed,
          })
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

        created += 1
      }).pipe(
        Effect.catchTags({
          DndWindowBlockedError: () => Effect.void,
          SqlError: (error) =>
            Effect.logWarning('Inactivity nudge error for user', {
              userId: user.id,
              error,
            }),
        })
      ),
    { concurrency: 10 }
  )

  if (created > 0) {
    yield* Effect.log('Created inactivity nudges', { count: created })
  }
}).pipe(Effect.withSpan('engagement-scheduler.inactivityNudges'))

// Process photo reminders for plants without recent photos
export const processPhotoReminders = Effect.gen(function* () {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  const usersWithTips = yield* engagementRepo.getUsersWithTipsEnabled()
  let created = 0

  yield* Effect.forEach(
    usersWithTips,
    (user) =>
      Effect.gen(function* () {
        const timezone = pipe(
          Option.fromNullable(user.timezone),
          Option.getOrElse(() => DEFAULT_TIMEZONE)
        )

        const stalePlants = yield* engagementRepo.getPlantsWithoutRecentPhoto(
          user.id,
          daysAgo(PHOTO_STALENESS_DAYS)
        )

        if (Array.isEmptyReadonlyArray(stalePlants)) return

        // Pick random time in morning/evening window
        const scheduledAt = yield* pipe(
          pickOverdueNotificationTime(
            timezone,
            user.doNotDisturb,
            user.doNotDisturbStart,
            user.doNotDisturbEnd,
            Math.random()
          ),
          Option.match({
            onNone: () => new DndWindowBlockedError({ userId: user.id }),
            onSome: Effect.succeed,
          })
        )

        // Send one notification per stale plant (deduped per plant per month)
        yield* Effect.forEach(stalePlants, (plant) =>
          Effect.gen(function* () {
            const alreadySent =
              yield* engagementRepo.hasNotificationForPlantInPeriod(
                user.id,
                'photo_reminder',
                plant.plantId,
                daysAgo(PHOTO_DEDUP_DAYS)
              )
            if (alreadySent) return

            const daysSincePhotoVal = plant.lastPhotoAt
              ? daysSince(plant.lastPhotoAt)
              : PHOTO_STALENESS_DAYS

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

            created += 1
          })
        )
      }).pipe(
        Effect.catchTags({
          DndWindowBlockedError: () => Effect.void,
          SqlError: (error) =>
            Effect.logWarning('Photo reminder error for user', {
              userId: user.id,
              error,
            }),
        })
      ),
    { concurrency: 10 }
  )

  if (created > 0) {
    yield* Effect.log('Created photo reminders', { count: created })
  }
}).pipe(Effect.withSpan('engagement-scheduler.photoReminders'))

// Process plant parent milestones
export const processPlantParentMilestones = Effect.gen(function* () {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  const usersWithTips = yield* engagementRepo.getUsersWithTipsEnabled()
  let created = 0

  yield* Effect.forEach(
    usersWithTips,
    (user) =>
      Effect.gen(function* () {
        const timezone = pipe(
          Option.fromNullable(user.timezone),
          Option.getOrElse(() => DEFAULT_TIMEZONE)
        )

        const daysSinceJoin = daysSince(user.createdAt)

        // Find matching milestone
        const matchingMilestone = Array.findFirst(
          MILESTONES,
          (m) => m === daysSinceJoin
        )

        if (Option.isNone(matchingMilestone)) return

        const milestone = matchingMilestone.value

        // Dedup: check if we already sent this milestone
        // Use a long lookback (milestone value + 1 day) to prevent re-sends
        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'plant_parent_milestone',
          daysAgo(milestone + 1)
        )
        if (alreadySent) return

        // Pick random time in morning/evening window
        const scheduledAt = yield* pipe(
          pickOverdueNotificationTime(
            timezone,
            user.doNotDisturb,
            user.doNotDisturbStart,
            user.doNotDisturbEnd,
            Math.random()
          ),
          Option.match({
            onNone: () => new DndWindowBlockedError({ userId: user.id }),
            onSome: Effect.succeed,
          })
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

        created += 1
      }).pipe(
        Effect.catchTags({
          DndWindowBlockedError: () => Effect.void,
          SqlError: (error) =>
            Effect.logWarning('Milestone error for user', {
              userId: user.id,
              error,
            }),
        })
      ),
    { concurrency: 10 }
  )

  if (created > 0) {
    yield* Effect.log('Created milestone notifications', { count: created })
  }
}).pipe(Effect.withSpan('engagement-scheduler.milestones'))

// Core effect: run all engagement checks
export const checkAndCreateEngagementNotifications = Effect.gen(function* () {
  yield* Effect.log('Running engagement notification check...')

  yield* processInactivityNudges
  yield* processPhotoReminders
  yield* processPlantParentMilestones
}).pipe(Effect.withSpan('engagement-scheduler.check'))

// Start the engagement scheduler as a background process
export const startEngagementScheduler = Effect.gen(function* () {
  // Run immediately on startup
  yield* checkAndCreateEngagementNotifications.pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logError('Engagement scheduler initial check error', error)
    )
  )

  // Then run periodically
  yield* Effect.fork(
    Effect.forever(
      Effect.sleep(POLL_INTERVAL).pipe(
        Effect.zipRight(
          checkAndCreateEngagementNotifications.pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.logError('Engagement scheduler polling error', error)
            )
          )
        )
      )
    )
  )

  yield* Effect.log('Engagement scheduler started')
})
