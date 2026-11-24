import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import {
  EngagementRepository,
  type UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  type EngagementRule,
  runRules,
  SkipUserError,
  sinceDaysAgo,
  unlessNotified,
} from '@lily/api/services/helpers/engagement-rules'
import { isOnVacation, nowAsDate, withTimeZone } from '@lily/shared'
import { Array, DateTime, Effect } from 'effect'

const SUNDAY = 0

export const weeklyRecap: EngagementRule<
  UserWithSettings,
  AchievementRepository | EngagementRepository | NotificationRepository
> = {
  name: 'weekly_recap',
  pastSlot: 'deliver',
  decide: (user, timezone) =>
    Effect.gen(function* () {
      const achievementRepo = yield* AchievementRepository
      const engagementRepo = yield* EngagementRepository

      const localNow = withTimeZone(DateTime.nowUnsafe(), timezone)
      if (DateTime.toParts(localNow).weekDay !== SUNDAY) {
        return yield* new SkipUserError({ reason: 'not_sunday' })
      }

      yield* unlessNotified(sinceDaysAgo(user.id, 'weekly_recap', 6))

      const [tasksCompleted, streak, healthyCount] = yield* Effect.all([
        engagementRepo.getCareLogsCountForWeek(user.id, timezone),
        achievementRepo.getCareStreak(user.id),
        engagementRepo.getHealthyPlantCountForUser(user.id),
      ])
      if (tasksCompleted === 0 && streak === 0) {
        return yield* new SkipUserError({ reason: 'no_activity' })
      }
      return [
        {
          topic: 'weekly_recap',
          params: { tasksCompleted, streakCount: streak, healthyCount },
        },
      ]
    }),
}

export const checkAndCreateWeeklyRecap = Effect.gen(function* () {
  yield* Effect.log('Running weekly recap check...')

  const engagementRepo = yield* EngagementRepository
  const allUsersWithDigest =
    yield* engagementRepo.getUsersWithWeeklyDigestEnabled

  // Weekly recap is an engagement notification — muted during vacation
  const usersWithDigest = Array.filter(
    allUsersWithDigest,
    (u) => !isOnVacation(u, nowAsDate())
  )

  yield* runRules('weekly-recap-scheduler', usersWithDigest, [weeklyRecap])
}).pipe(Effect.withSpan('weekly-recap-scheduler.check'))

export const startWeeklyRecapScheduler = createScheduler({
  name: 'weekly-recap-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndCreateWeeklyRecap,
})
