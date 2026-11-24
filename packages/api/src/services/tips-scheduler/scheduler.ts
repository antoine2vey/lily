import { DailyTipRepository } from '@lily/api/repositories/daily-tip.repository'
import { EngagementRepository } from '@lily/api/repositories/engagement.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { recordNotificationAt } from '@lily/api/services/helpers/schedule-notification'
import {
  DEFAULT_TIMEZONE,
  daysAgoAsDate,
  isOnVacation,
  localDayKey,
  nowAsDate,
  pickNotificationTime,
  startOfLocalDay,
  startOfTodayAsDate,
} from '@lily/shared'
import {
  Array,
  Config,
  DateTime,
  Effect,
  Option,
  Order,
  pipe,
  Random,
} from 'effect'
import { generateDailyTip } from './generator'

const TIP_DEDUP_DAYS = 3

const resolveLocalized = (
  localized: Record<string, string>,
  language: string
): string =>
  Option.getOrElse(Option.fromNullishOr(localized[language]), () =>
    Option.getOrElse(Option.fromNullishOr(localized.en), () => '')
  )

/** Today's tip, generated on the first run of the UTC day. */
const tipOfToday = Effect.gen(function* () {
  const tipRepo = yield* DailyTipRepository
  const today = localDayKey(DateTime.nowUnsafe(), 'UTC')

  const existing = Option.fromNullishOr(yield* tipRepo.findByDate(today))
  if (Option.isSome(existing)) return existing

  yield* Effect.log('Generating daily tip', { date: today })

  const generatedTip = yield* generateDailyTip

  const created = Option.fromNullishOr(
    yield* tipRepo.create({
      title: { ...generatedTip.title },
      body: { ...generatedTip.body },
      category: generatedTip.category,
      tags: [...generatedTip.tags],
      publishDate: today,
    })
  )

  yield* Option.match(created, {
    onNone: () => Effect.logWarning('Failed to create daily tip record'),
    onSome: (tip) =>
      Effect.log('Daily tip created', {
        tipId: tip.id,
        category: tip.category,
      }),
  })

  return created
})

// Every run offers today's tip to every user. A run that stopped midway is
// finished by the next one, and a user's own daily_tip row of the last three
// days keeps them from getting it again.
export const checkAndGenerateTip = Effect.gen(function* () {
  const enabled = yield* Config.withDefault(
    Config.Boolean('TIPS_GENERATION_ENABLED'),
    false
  )

  if (!enabled) {
    yield* Effect.logWarning('Tips generation skipped — disabled by config')
    return
  }

  const engagementRepo = yield* EngagementRepository

  const published = yield* tipOfToday
  if (Option.isNone(published)) return
  const tip = published.value

  // Find all users with tips enabled — minus those on vacation
  const allUsers = yield* engagementRepo.getUsersWithTipsEnabled
  const users = Array.filter(allUsers, (u) => !isOnVacation(u, nowAsDate()))

  if (!Array.isReadonlyArrayNonEmpty(users)) return

  const now = DateTime.nowUnsafe()
  const awaited = Array.map(users, (user) => {
    const timezone = Option.getOrElse(
      Option.fromNullishOr(user.timezone),
      () => DEFAULT_TIMEZONE
    )
    return {
      user,
      timezone,
      today: startOfTodayAsDate(timezone),
      // A user comes due at their own midnight, so the first run after it
      // still has both slots of the day ahead. A window counted back from now
      // would start each cycle later than the last.
      tipsSince: pipe(
        startOfLocalDay(
          localDayKey(now, timezone),
          timezone,
          1 - TIP_DEDUP_DAYS
        ),
        Option.map(DateTime.toDateUtc),
        Option.getOrElse(() => daysAgoAsDate(TIP_DEDUP_DAYS))
      ),
    }
  })

  // One read for every user, whatever their number: the hourly run must not
  // cost a query per user.
  const recent = yield* engagementRepo.getTipFatigueNotifications({
    tipsSince: Array.min(
      Array.map(awaited, ({ tipsSince }) => tipsSince),
      Order.Date
    ),
    careRemindersSince: Array.min(
      Array.map(awaited, ({ today }) => today),
      Order.Date
    ),
  })
  const recentOf = Array.groupBy(recent, (n) => n.userId)

  // Fatigue prevention: one tip per three local days, and none on a local day
  // that already has a care reminder.
  const due = Array.filter(
    awaited,
    ({ user, today, tipsSince }) =>
      !Array.some(
        Option.getOrElse(Option.fromNullishOr(recentOf[user.id]), () => []),
        (n) => n.createdAt >= (n.kind === 'tip' ? tipsSince : today)
      )
  )

  yield* Effect.log('Sending daily tip notifications', {
    userCount: Array.length(due),
  })

  // Create pending notification records with randomized send times
  // within morning/evening windows, respecting DND — same as overdue reminders
  yield* Effect.forEach(
    due,
    ({ user, timezone }) =>
      Effect.gen(function* () {
        const randomValue = yield* Random.next
        const scheduledAt = yield* pickNotificationTime(
          user.id,
          timezone,
          user.doNotDisturb,
          user.doNotDisturbStart,
          user.doNotDisturbEnd,
          randomValue
        )
        // Both slots are on today's local date. One that has passed would go
        // out at once, at any hour, so the user waits for a later run.
        if (scheduledAt <= nowAsDate()) return

        const language = Option.getOrElse(
          Option.fromNullishOr(user.language),
          () => 'en' as const
        )

        yield* recordNotificationAt(
          'daily_tip',
          user.id,
          {
            tipTitle: resolveLocalized(tip.title, language),
            tipBody: resolveLocalized(tip.body, language),
          },
          language,
          {},
          { scheduledAt }
        )
      }).pipe(
        Effect.catchTags({
          DndWindowBlockedError: () =>
            Effect.log('[tips-scheduler] Skipped — DND window', {
              userId: user.id,
            }),
          SqlError: (e) =>
            Effect.logWarning('[tips-scheduler] Failed for user', {
              userId: user.id,
              error: String(e),
            }),
        })
      ),
    { concurrency: 10 }
  )

  yield* Effect.log('Daily tip notifications created', {
    userCount: Array.length(due),
  })
}).pipe(Effect.withSpan('tips-scheduler.check'))

export const startTipsScheduler = createScheduler({
  name: 'tips-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndGenerateTip,
})
