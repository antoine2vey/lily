import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import {
  EngagementRepository,
  type PlantAnniversary,
  type TrialingUser,
  type UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  type EngagementRule,
  type Nudge,
  runRules,
  SkipUserError,
  sinceDaysAgo,
  unlessNotified,
} from '@lily/api/services/helpers/engagement-rules'
import {
  daysAgoAsDate,
  daysSince,
  isOnVacation,
  nowAsDate,
  startOfTodayAsDate,
  startOfTomorrowAsDate,
  withTimeZone,
} from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe } from 'effect'

const INACTIVITY_DAYS = 7
const PHOTO_STALENESS_DAYS = 30
// Milestone days since signup
const MILESTONES = [7, 30, 90, 180, 365] as const

const INACTIVITY_DEDUP_DAYS = 7
const PHOTO_DEDUP_DAYS = 30
const ANNIVERSARY_DEDUP_DAYS = 32

const STREAK_AT_RISK_MIN = 3
const STREAK_AT_RISK_HOUR = 18 // 6 PM local time
const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365] as const

// Plant anniversary milestones (in months)
const ANNIVERSARY_MONTHS = [1, 3, 6, 12] as const

// Trial ending thresholds (days before trial ends)
const TRIAL_ENDING_DAYS = [3, 1] as const

const SCHEDULER_NAME = 'engagement-scheduler'

const streakOf = (streaks: ReadonlyMap<string, number>, userId: string) =>
  Option.getOrElse(Option.fromNullishOr(streaks.get(userId)), () => 0)

export const inactivityNudge: EngagementRule<
  UserWithSettings,
  EngagementRepository | NotificationRepository
> = {
  name: 'inactivity',
  decide: (user) =>
    Effect.gen(function* () {
      const engagementRepo = yield* EngagementRepository
      yield* unlessNotified(
        sinceDaysAgo(user.id, 'inactivity_nudge', INACTIVITY_DEDUP_DAYS)
      )

      const lastCareDate = yield* engagementRepo.getLastCareDate(user.id)
      yield* pipe(
        Option.fromNullishOr(lastCareDate),
        Option.match({
          onNone: () => Effect.void,
          onSome: (date) =>
            daysSince(date) < INACTIVITY_DAYS
              ? new SkipUserError({ reason: 'recent_care' })
              : Effect.void,
        })
      )

      const plantCount = yield* engagementRepo.getPlantCountForUser(user.id)
      if (plantCount === 0) {
        return yield* new SkipUserError({ reason: 'no_plants' })
      }
      return [{ topic: 'inactivity_nudge', params: { plantCount } }]
    }),
}

export const photoReminder: EngagementRule<
  UserWithSettings,
  EngagementRepository | NotificationRepository
> = {
  name: 'photo_reminder',
  decide: (user) =>
    Effect.gen(function* () {
      const engagementRepo = yield* EngagementRepository
      const notificationRepo = yield* NotificationRepository

      const stalePlants = yield* engagementRepo.getPlantsWithoutRecentPhoto(
        user.id,
        daysAgoAsDate(PHOTO_STALENESS_DAYS)
      )
      if (Array.isReadonlyArrayEmpty(stalePlants)) {
        return yield* new SkipUserError({ reason: 'no_stale_plants' })
      }

      const unreminded = yield* Effect.filter(stalePlants, (plant) =>
        Effect.map(
          notificationRepo.hasNotificationIn({
            ...sinceDaysAgo(user.id, 'photo_reminder', PHOTO_DEDUP_DAYS),
            plantId: plant.plantId,
          }),
          (sent) => !sent
        )
      )
      if (Array.isReadonlyArrayEmpty(unreminded)) {
        return yield* new SkipUserError({ reason: 'already_sent' })
      }
      return Array.map(
        unreminded,
        (plant): Nudge => ({
          topic: 'photo_reminder',
          params: {
            plantName: plant.plantName,
            daysSincePhoto: daysSince(
              Option.getOrElse(
                Option.fromNullishOr(plant.lastPhotoAt),
                () => plant.dateAdded
              )
            ),
          },
          plantId: plant.plantId,
        })
      )
    }),
}

export const plantParentMilestone: EngagementRule<
  UserWithSettings,
  NotificationRepository
> = {
  name: 'milestone',
  decide: (user) =>
    Effect.gen(function* () {
      const daysSinceJoin = daysSince(user.createdAt)
      const milestone = yield* pipe(
        Array.findFirst(MILESTONES, (m) => m === daysSinceJoin),
        Option.match({
          onNone: () => new SkipUserError({ reason: 'no_milestone' }),
          onSome: Effect.succeed,
        })
      )

      // Use a long lookback (milestone value + 1 day) to prevent re-sends
      yield* unlessNotified(
        sinceDaysAgo(user.id, 'plant_parent_milestone', milestone + 1)
      )
      return [
        {
          topic: 'plant_parent_milestone',
          params: { daysSinceJoin: milestone },
        },
      ]
    }),
}

export const streakAtRisk = (
  streaks: ReadonlyMap<string, number>
): EngagementRule<
  UserWithSettings,
  CareLogRepository | EngagementRepository | NotificationRepository
> => ({
  name: 'streak_at_risk',
  decide: (user, timezone) =>
    Effect.gen(function* () {
      const careLogRepo = yield* CareLogRepository
      const engagementRepo = yield* EngagementRepository

      const streak = streakOf(streaks, user.id)
      if (streak < STREAK_AT_RISK_MIN) {
        return yield* new SkipUserError({ reason: 'streak_too_short' })
      }

      const localNow = withTimeZone(DateTime.nowUnsafe(), timezone)
      if (DateTime.toParts(localNow).hour < STREAK_AT_RISK_HOUR) {
        return yield* new SkipUserError({ reason: 'before_6pm' })
      }

      yield* unlessNotified({
        userId: user.id,
        topics: ['streak_at_risk'],
        counting: 'produced',
        from: startOfTodayAsDate(timezone),
        until: startOfTomorrowAsDate(timezone),
      })

      const todayCount = yield* careLogRepo.countTodayPerformedByUser(
        user.id,
        timezone
      )
      if (todayCount > 0) {
        return yield* new SkipUserError({ reason: 'care_done_today' })
      }

      const plantNames = yield* engagementRepo.getPlantNamesForUser(user.id)
      return [
        {
          topic: 'streak_at_risk',
          params: pipe(
            Array.head(plantNames),
            Option.match({
              onNone: () => ({ streakCount: streak }),
              onSome: (plantName) => ({ streakCount: streak, plantName }),
            })
          ),
        },
      ]
    }),
})

export const streakMilestone = (
  streaks: ReadonlyMap<string, number>
): EngagementRule<UserWithSettings, NotificationRepository> => ({
  name: 'streak_milestone',
  decide: (user) =>
    Effect.gen(function* () {
      const streak = streakOf(streaks, user.id)
      if (!Array.contains(STREAK_MILESTONES, streak)) {
        return yield* new SkipUserError({ reason: 'no_milestone' })
      }
      yield* unlessNotified(
        sinceDaysAgo(user.id, 'streak_milestone', streak + 1)
      )
      return [{ topic: 'streak_milestone', params: { streakCount: streak } }]
    }),
})

export const trialEnding = (
  daysLeft: number
): EngagementRule<TrialingUser, NotificationRepository> => ({
  name: 'trial_ending',
  decide: (user) =>
    Effect.gen(function* () {
      yield* unlessNotified(sinceDaysAgo(user.id, 'trial_ending', daysLeft + 1))
      return [{ topic: 'trial_ending', params: { trialDaysLeft: daysLeft } }]
    }),
})

/** Every anniversary of a user's plants goes out in one push. */
export const plantAnniversary = (
  plants: ReadonlyArray<PlantAnniversary>
): EngagementRule<UserWithSettings, NotificationRepository> => {
  const plantsOf = Array.groupBy(plants, (p) => p.userId)
  return {
    name: 'plant_anniversary',
    decide: (user) =>
      Effect.gen(function* () {
        const notificationRepo = yield* NotificationRepository
        const theirs = Option.fromNullishOr(plantsOf[user.id])
        if (Option.isNone(theirs)) return []

        const uncelebrated = yield* Effect.filter(theirs.value, (plant) =>
          Effect.map(
            notificationRepo.hasNotificationIn({
              ...sinceDaysAgo(
                user.id,
                'plant_anniversary',
                ANNIVERSARY_DEDUP_DAYS
              ),
              plantId: plant.plantId,
            }),
            (sent) => !sent
          )
        )
        if (Array.isReadonlyArrayEmpty(uncelebrated)) {
          return yield* new SkipUserError({ reason: 'already_sent' })
        }
        return Array.map(
          uncelebrated,
          (plant): Nudge => ({
            topic: 'plant_anniversary',
            params: {
              plantName: plant.plantName,
              anniversaryMonths: Math.round(daysSince(plant.dateAdded) / 30.44),
              plantAddedAt: plant.dateAdded,
            },
            plantId: plant.plantId,
          })
        )
      }),
  }
}

export const checkAndCreateEngagementNotifications = Effect.gen(function* () {
  yield* Effect.log('Running engagement notification check...')

  const engagementRepo = yield* EngagementRepository

  const [allUsersWithTips, allUsersWithCareReminders] = yield* Effect.all([
    engagementRepo.getUsersWithTipsEnabled,
    engagementRepo.getUsersWithCareRemindersEnabled,
  ])

  // Engagement notifications are muted while the recipient is on vacation
  const now = nowAsDate()
  const usersWithTips = Array.filter(
    allUsersWithTips,
    (u) => !isOnVacation(u, now)
  )
  const usersWithCareReminders = Array.filter(
    allUsersWithCareReminders,
    (u) => !isOnVacation(u, now)
  )

  if (!Array.isReadonlyArrayEmpty(usersWithTips)) {
    yield* runRules(SCHEDULER_NAME, usersWithTips, [
      inactivityNudge,
      photoReminder,
      plantParentMilestone,
    ])
  }

  if (!Array.isReadonlyArrayEmpty(usersWithCareReminders)) {
    const achievementRepo = yield* AchievementRepository
    const streaks = yield* achievementRepo.getBatchCareStreaks(
      Array.map(usersWithCareReminders, (u) => u.id)
    )
    const anniversaries =
      yield* engagementRepo.getPlantsWithAnniversary(ANNIVERSARY_MONTHS)

    yield* runRules(SCHEDULER_NAME, usersWithCareReminders, [
      streakAtRisk(streaks),
      streakMilestone(streaks),
      plantAnniversary(anniversaries),
    ])
  }

  yield* Effect.forEach(
    TRIAL_ENDING_DAYS,
    (daysLeft) =>
      Effect.flatMap(
        engagementRepo.getTrialingUsersWithTrialEndingSoon(daysLeft),
        (trialingUsers) =>
          runRules(SCHEDULER_NAME, trialingUsers, [trialEnding(daysLeft)])
      ),
    { discard: true }
  )
}).pipe(
  Effect.catchTags({
    SqlError: (error) =>
      Effect.logError(
        `[engagement-scheduler] Database error: ${error.message}`,
        { cause: String(error.cause) }
      ),
  }),
  Effect.withSpan('engagement-scheduler.check')
)

export const startEngagementScheduler = createScheduler({
  name: 'engagement-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndCreateEngagementNotifications,
})
