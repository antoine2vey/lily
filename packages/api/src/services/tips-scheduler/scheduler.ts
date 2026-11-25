import {
  type DailyTip,
  DailyTipRepository,
} from '@lily/api/repositories/daily-tip.repository'
import {
  EngagementRepository,
  type UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  type EngagementRule,
  runRules,
} from '@lily/api/services/helpers/engagement-rules'
import { resolveTimezone } from '@lily/api/services/helpers/resolve-timezone'
import {
  daysAgoAsDate,
  isOnVacation,
  localDayKey,
  nowAsDate,
  startOfLocalDay,
  startOfTodayAsDate,
  utcDayKey,
} from '@lily/shared'
import { Array, Config, DateTime, Effect, Option, Order, pipe } from 'effect'
import { generateDailyTip } from './generator'

const TIP_DEDUP_DAYS = 3

const resolveLocalized = (
  localized: Record<string, string>,
  language: string
): string =>
  Option.getOrElse(Option.fromNullishOr(localized[language]), () =>
    Option.getOrElse(Option.fromNullishOr(localized.en), () => '')
  )

const dailyTip = (tip: DailyTip): EngagementRule<UserWithSettings, never> => ({
  name: 'daily_tip',
  decide: (user) =>
    Effect.succeed([
      {
        topic: 'daily_tip',
        params: {
          tipTitle: resolveLocalized(tip.title, user.language),
          tipBody: resolveLocalized(tip.body, user.language),
        },
      },
    ]),
})

/** Today's tip, generated on the first run of the UTC day. */
const tipOfToday = Effect.gen(function* () {
  const tipRepo = yield* DailyTipRepository
  const today = utcDayKey(DateTime.nowUnsafe())

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
    const timezone = resolveTimezone(user.timezone)
    return {
      user,
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

  yield* runRules(
    'tips-scheduler',
    Array.map(due, ({ user }) => user),
    [dailyTip(tip)]
  )
}).pipe(Effect.withSpan('tips-scheduler.check'))

export const startTipsScheduler = createScheduler({
  name: 'tips-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndGenerateTip,
})
