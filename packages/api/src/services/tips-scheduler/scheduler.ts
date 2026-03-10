import { EngagementRepository } from '@lily/api/repositories/engagement.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PLANT_TIPS,
  resolveTipContent,
} from '@lily/api/services/tips-scheduler/tips-content'
import {
  DEFAULT_TIMEZONE,
  DndWindowBlockedError,
  pickOverdueNotificationTime,
} from '@lily/shared'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'
import type { DurationInput } from 'effect/Duration'

// Check every hour (same cadence as other schedulers)
const POLL_INTERVAL: DurationInput = '1 hour'

// Tip dedup period: no more than 1 tip per 3 days
const TIP_DEDUP_DAYS = 3

const daysAgo = (days: number): Date => {
  const dt = DateTime.unsafeNow()
  const shifted = DateTime.subtractDuration(dt, Duration.days(days))
  return DateTime.toDateUtc(shifted)
}

// Pick a random tip from the bank, optionally personalized
const pickRandomTip = (personalized: boolean) => {
  const eligible = personalized
    ? PLANT_TIPS
    : Array.filter(PLANT_TIPS, (t) => !t.personalized)

  const index = Math.floor(Math.random() * eligible.length)
  return pipe(
    Array.get(eligible, index),
    Option.getOrElse(() => Array.unsafeGet(PLANT_TIPS, 0))
  )
}

// Process plant tips for all eligible users
export const processPlantTips = Effect.gen(function* () {
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

        // Dedup: skip if already sent a tip in last 3 days
        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'plant_tip',
          daysAgo(TIP_DEDUP_DAYS)
        )
        if (alreadySent) return

        // Also skip if a care reminder was sent today (avoid notification fatigue)
        const careReminderToday =
          yield* notificationRepo.hasNotificationOfTypeTodayForUser(
            user.id,
            timezone,
            'watering_reminder'
          )
        if (careReminderToday) return

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

        // If personalizedTips, get a random plant name
        let plantName: string | undefined
        if (user.personalizedTips) {
          const plantNames = yield* engagementRepo.getPlantNamesForUser(user.id)
          if (plantNames.length > 0) {
            const randomIndex = Math.floor(Math.random() * plantNames.length)
            plantName = pipe(
              Array.get(plantNames, randomIndex),
              Option.getOrUndefined
            )
          }
        }

        const canPersonalize = user.personalizedTips && !!plantName
        const tip = pickRandomTip(canPersonalize)
        const { title, body } = resolveTipContent(tip, user.language, plantName)

        yield* notificationRepo.create({
          type: 'plant_tip',
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
            Effect.logWarning('Plant tip error for user', {
              userId: user.id,
              error,
            }),
        })
      ),
    { concurrency: 10 }
  )

  if (created > 0) {
    yield* Effect.log('Created plant tips', { count: created })
  }
}).pipe(Effect.withSpan('tips-scheduler.process'))

// Start the tips scheduler as a background process
export const startTipsScheduler = Effect.gen(function* () {
  // Run immediately on startup
  yield* processPlantTips.pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logError('Tips scheduler initial check error', error)
    )
  )

  // Then run periodically
  yield* Effect.fork(
    Effect.forever(
      Effect.sleep(POLL_INTERVAL).pipe(
        Effect.zipRight(
          processPlantTips.pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.logError('Tips scheduler polling error', error)
            )
          )
        )
      )
    )
  )

  yield* Effect.log('Tips scheduler started')
})
