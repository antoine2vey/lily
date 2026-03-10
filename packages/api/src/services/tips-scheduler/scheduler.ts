import { DailyTipRepository } from '@lily/api/repositories/daily-tip.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { nowAsDate } from '@lily/shared'
import { MessageQueue, type NotificationTopic } from '@lily/shared/server'
import { Array, Config, DateTime, Effect, Option } from 'effect'
import type { DurationInput } from 'effect/Duration'
import { generateDailyTip } from './generator'

const POLL_INTERVAL: DurationInput = '1 hour'

const getTodayDateString = (): string => {
  const now = DateTime.unsafeNow()
  const parts = DateTime.toParts(now)
  const month = globalThis.String(parts.month).padStart(2, '0')
  const day = globalThis.String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
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
  const userRepo = yield* UserRepository
  const notificationRepo = yield* NotificationRepository
  const queue = yield* MessageQueue

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
  const users = yield* userRepo.findTipsEnabled()

  if (Array.isEmptyArray(users)) return

  yield* Effect.log('Sending daily tip notifications', {
    userCount: Array.length(users),
  })

  // Create notification for each user and immediately enqueue
  const topic: NotificationTopic = 'daily_tip'

  yield* Effect.forEach(
    users,
    (user) =>
      Effect.gen(function* () {
        const language = Option.getOrElse(
          Option.fromNullable(user.language),
          () => 'en' as const
        )

        const title = resolveLocalized(tip.title, language)
        const body = resolveLocalized(tip.body, language)

        // Create notification record
        const notification = yield* notificationRepo.create({
          type: 'daily_tip',
          title,
          body,
          scheduledAt: nowAsDate(),
          userId: user.id,
        })

        if (!notification) return

        // Enqueue and mark as queued in parallel (independent operations)
        yield* Effect.all(
          [
            queue.enqueue(topic, {
              id: crypto.randomUUID(),
              topic,
              payload: {
                userId: user.id,
                title,
                body,
                notificationIds: [notification.id],
                plantIds: [],
              },
              retryCount: 0,
              createdAt: nowAsDate(),
              scheduledAt: nowAsDate(),
            }),
            notificationRepo.markManyAsQueued([notification.id]),
          ],
          { concurrency: 'unbounded' }
        )
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning('Failed to send tip notification to user', {
            userId: user.id,
            error: globalThis.String(error),
          })
        )
      ),
    { concurrency: 10 }
  )

  yield* Effect.log('Daily tip notifications enqueued', {
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
