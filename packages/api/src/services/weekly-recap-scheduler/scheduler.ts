import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import {
  EngagementRepository,
  type UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  processUsers,
  SkipUserError,
} from '@lily/api/services/helpers/process-users'
import { resolveTimezone } from '@lily/api/services/helpers/resolve-timezone'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import { daysAgoAsDate, pickNotificationTime, withTimeZone } from '@lily/shared'
import { Array, DateTime, Effect, Random } from 'effect'

// Only send on Sunday
const SUNDAY = 0

export const processWeeklyRecap = Effect.fn(
  'weekly-recap-scheduler.processWeeklyRecap'
)(function* (usersWithDigest: ReadonlyArray<UserWithSettings>) {
  const achievementRepo = yield* AchievementRepository
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  yield* processUsers({
    schedulerName: 'weekly-recap-scheduler',
    notificationType: 'weekly_recap',
    users: usersWithDigest,
    processUser: (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)

        const localNow = withTimeZone(DateTime.unsafeNow(), timezone)
        const { weekDay } = DateTime.toParts(localNow)
        if (weekDay !== SUNDAY) {
          return yield* new SkipUserError({ reason: 'not_sunday' })
        }

        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'weekly_recap',
          daysAgoAsDate(6)
        )
        if (alreadySent) {
          return yield* new SkipUserError({ reason: 'already_sent' })
        }

        const [tasksCompleted, streak, healthyCount] = yield* Effect.all([
          engagementRepo.getCareLogsCountForWeek(user.id, timezone),
          achievementRepo.getCareStreak(user.id),
          engagementRepo.getHealthyPlantCountForUser(user.id),
        ])

        if (tasksCompleted === 0 && streak === 0) {
          return yield* new SkipUserError({ reason: 'no_activity' })
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
          'weekly_recap',
          { tasksCompleted, streakCount: streak, healthyCount },
          user.language
        )

        yield* notificationRepo.create({
          type: 'weekly_recap',
          title,
          body,
          scheduledAt,
          userId: user.id,
        })
      }),
  })
})

const checkAndCreateWeeklyRecap = Effect.gen(function* () {
  yield* Effect.log('Running weekly recap check...')

  const engagementRepo = yield* EngagementRepository
  const usersWithDigest =
    yield* engagementRepo.getUsersWithWeeklyDigestEnabled()

  if (Array.isEmptyReadonlyArray(usersWithDigest)) return

  yield* processWeeklyRecap(usersWithDigest)
}).pipe(Effect.withSpan('weekly-recap-scheduler.check'))

export const startWeeklyRecapScheduler = createScheduler({
  name: 'weekly-recap-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndCreateWeeklyRecap,
})
