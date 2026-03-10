import {
  EngagementRepository,
  type UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import {
  DEFAULT_TIMEZONE,
  daysAgoAsDate,
  daysSince,
  pickOverdueNotificationTime,
} from '@lily/shared'
import { Array, Data, Effect, Option, pipe, Random, Ref } from 'effect'
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

class SkipUserError extends Data.TaggedError('SkipUserError')<{
  readonly reason: string
}> {}

// Resolve timezone from nullable user setting
const resolveTimezone = (tz: string | null): string =>
  Option.getOrElse(Option.fromNullable(tz), () => DEFAULT_TIMEZONE)

// Process inactivity nudges for all eligible users
export const processInactivityNudges = (
  usersWithTips: ReadonlyArray<UserWithSettings>
) =>
  Effect.gen(function* () {
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
            yield* new SkipUserError({ reason: 'already_sent' })
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
            yield* new SkipUserError({ reason: 'no_plants' })
          }

          const randomValue = yield* Random.next
          const scheduledAt = yield* pickOverdueNotificationTime(
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
            SkipUserError: () => Effect.void,
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

    const total = yield* Ref.get(created)
    if (total > 0) {
      yield* Effect.log('Created inactivity nudges', { count: total })
    }
  }).pipe(Effect.withSpan('engagement-scheduler.inactivityNudges'))

// Process photo reminders for plants without recent photos
export const processPhotoReminders = (
  usersWithTips: ReadonlyArray<UserWithSettings>
) =>
  Effect.gen(function* () {
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
            yield* new SkipUserError({ reason: 'no_stale_plants' })
          }

          const randomValue = yield* Random.next
          const scheduledAt = yield* pickOverdueNotificationTime(
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
                yield* new SkipUserError({ reason: 'already_sent' })
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
            })
          )
        }).pipe(
          Effect.catchTags({
            SkipUserError: () => Effect.void,
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

    const total = yield* Ref.get(created)
    if (total > 0) {
      yield* Effect.log('Created photo reminders', { count: total })
    }
  }).pipe(Effect.withSpan('engagement-scheduler.photoReminders'))

// Process plant parent milestones
export const processPlantParentMilestones = (
  usersWithTips: ReadonlyArray<UserWithSettings>
) =>
  Effect.gen(function* () {
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
            yield* new SkipUserError({ reason: 'already_sent' })
          }

          const randomValue = yield* Random.next
          const scheduledAt = yield* pickOverdueNotificationTime(
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
            SkipUserError: () => Effect.void,
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

    const total = yield* Ref.get(created)
    if (total > 0) {
      yield* Effect.log('Created milestone notifications', { count: total })
    }
  }).pipe(Effect.withSpan('engagement-scheduler.milestones'))

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
