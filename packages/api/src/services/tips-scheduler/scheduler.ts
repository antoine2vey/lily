import { DailyTipRepository } from '@lily/api/repositories/daily-tip.repository'
import { EngagementRepository } from '@lily/api/repositories/engagement.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  DEFAULT_TIMEZONE,
  DndWindowBlockedError,
  pickOverdueNotificationTime,
} from '@lily/shared'
import { Array, Config, DateTime, Duration, Effect, Option } from 'effect'
import type { DurationInput } from 'effect/Duration'
import { generateDailyTip } from './generator'

const POLL_INTERVAL: DurationInput = '1 hour'

// Tip dedup period: no more than 1 tip per 3 days
const TIP_DEDUP_DAYS = 3

const getTodayDateString = (): string => {
  const now = DateTime.unsafeNow()
  const parts = DateTime.toParts(now)
  const month = globalThis.String(parts.month).padStart(2, '0')
  const day = globalThis.String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

const daysAgo = (days: number): Date => {
  const dt = DateTime.unsafeNow()
  const shifted = DateTime.subtractDuration(dt, Duration.days(days))
  return DateTime.toDateUtc(shifted)
}

/** Resolve localized text for a given language, falling back to English */
const resolveLocalized = (
  localized: Record<string, string>,
  language: string
): string =>
  Option.getOrElse(Option.fromNullable(localized[language]), () =>
    Option.getOrElse(Option.fromNullable(localized.en), () => '')
  )

// Core effect: check if tip exists for today, generate if not, send notifications
export const checkAndGenerateTip = Effect.gen(function* () {
  // Feature flag check
  const enabled = yield* Config.withDefault(
    Config.string('TIPS_GENERATION_ENABLED'),
    'false'
  )

  if (enabled !== 'true') return

  const tipRepo = yield* DailyTipRepository
  const notificationRepo = yield* NotificationRepository
  const engagementRepo = yield* EngagementRepository

  const today = getTodayDateString()

  // Check if tip already exists for today
  const existingTip = yield* tipRepo.findByDate(today)

  if (existingTip) return

  yield* Effect.log('Generating daily tip', { date: today })

  // Generate the tip
  const generatedTip = yield* generateDailyTip

  // Store in database
  const tip = yield* tipRepo.create({
    title: { ...generatedTip.title },
    body: { ...generatedTip.body },
    category: generatedTip.category,
    tags: [...generatedTip.tags],
    publishDate: today,
  })

  if (!tip) {
    yield* Effect.logWarning('Failed to create daily tip record')
    return
  }

  yield* Effect.log('Daily tip created', {
    tipId: tip.id,
    category: tip.category,
  })

  // Find all users with tips enabled
  const users = yield* engagementRepo.getUsersWithTipsEnabled()

  if (Array.isEmptyReadonlyArray(users)) return

  yield* Effect.log('Sending daily tip notifications', {
    userCount: Array.length(users),
  })

  // Create pending notification records with randomized send times
  // within morning/evening windows, respecting DND — same as overdue reminders
  yield* Effect.forEach(
    users,
    (user) =>
      Effect.gen(function* () {
        const timezone = Option.getOrElse(
          Option.fromNullable(user.timezone),
          () => DEFAULT_TIMEZONE
        )

        // Fatigue prevention: skip if already sent a tip in last 3 days
        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'daily_tip',
          daysAgo(TIP_DEDUP_DAYS)
        )
        if (alreadySent) return

        // Fatigue prevention: skip if a care reminder was sent today
        const careReminderToday =
          yield* notificationRepo.hasNotificationOfTypeTodayForUser(
            user.id,
            timezone,
            'watering_reminder'
          )
        if (careReminderToday) return

        const scheduledAt = yield* Option.match(
          pickOverdueNotificationTime(
            timezone,
            user.doNotDisturb,
            user.doNotDisturbStart,
            user.doNotDisturbEnd,
            Math.random()
          ),
          {
            onNone: () => new DndWindowBlockedError({ userId: user.id }),
            onSome: Effect.succeed,
          }
        )

        const language = Option.getOrElse(
          Option.fromNullable(user.language),
          () => 'en' as const
        )

        const title = resolveLocalized(tip.title, language)
        const body = resolveLocalized(tip.body, language)

        yield* notificationRepo.create({
          type: 'daily_tip',
          title,
          body,
          scheduledAt,
          userId: user.id,
        })
      }).pipe(
        Effect.catchTag('DndWindowBlockedError', (error) =>
          Effect.log('Skipping daily tip — both windows blocked by DND', {
            userId: error.userId,
          })
        ),
        Effect.catchAll((error) =>
          Effect.logWarning('Failed to create tip notification for user', {
            userId: user.id,
            error: globalThis.String(error),
          })
        )
      ),
    { concurrency: 10 }
  )

  yield* Effect.log('Daily tip notifications created', {
    userCount: Array.length(users),
  })
}).pipe(Effect.withSpan('tips-scheduler.check'))

// Start the tips scheduler as a background process
export const startTipsScheduler = Effect.gen(function* () {
  // Run once immediately on startup (forked to not block Layer init)
  yield* Effect.fork(
    checkAndGenerateTip.pipe(
      Effect.catchAll((error) =>
        Effect.logError('Tips scheduler initial error', error)
      )
    )
  )

  // Then run periodically
  yield* Effect.fork(
    Effect.forever(
      Effect.sleep(POLL_INTERVAL).pipe(
        Effect.zipRight(
          checkAndGenerateTip.pipe(
            Effect.catchAll((error) =>
              Effect.logError('Tips scheduler polling error', error)
            )
          )
        )
      )
    )
  )

  yield* Effect.log('Tips scheduler started')
})
