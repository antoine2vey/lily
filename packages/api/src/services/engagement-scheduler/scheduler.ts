import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
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
import {
  daysAgoAsDate,
  daysSince,
  pickNotificationTime,
  withTimeZone,
} from '@lily/shared'
import {
  Array,
  DateTime,
  Effect,
  Option,
  pipe,
  Random,
  Record,
  Ref,
} from 'effect'

// Inactivity threshold: 7 days without care
const INACTIVITY_DAYS = 7
// Photo staleness threshold: 30 days without a photo
const PHOTO_STALENESS_DAYS = 30
// Milestone days since signup
const MILESTONES = [7, 30, 90, 180, 365] as const

// Dedup periods (in days)
const INACTIVITY_DEDUP_DAYS = 7
const PHOTO_DEDUP_DAYS = 30

// Streak notification thresholds
const STREAK_AT_RISK_MIN = 3
const STREAK_AT_RISK_HOUR = 18 // 6 PM local time
const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365] as const

// Plant anniversary milestones (in months)
const ANNIVERSARY_MONTHS = [1, 3, 6, 12] as const

// Trial ending thresholds (days before trial ends)
const TRIAL_ENDING_DAYS = [3, 1] as const

const SCHEDULER_NAME = 'engagement-scheduler'

export const processInactivityNudges = Effect.fn(
  'engagement-scheduler.inactivityNudges'
)(function* (usersWithTips: ReadonlyArray<UserWithSettings>) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  yield* processUsers({
    schedulerName: SCHEDULER_NAME,
    notificationType: 'inactivity',
    users: usersWithTips,
    processUser: (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)

        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'inactivity_nudge',
          daysAgoAsDate(INACTIVITY_DEDUP_DAYS)
        )
        if (alreadySent) {
          return yield* new SkipUserError({ reason: 'already_sent' })
        }

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

        const plantCount = yield* engagementRepo.getPlantCountForUser(user.id)
        if (plantCount === 0) {
          return yield* new SkipUserError({ reason: 'no_plants' })
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
      }),
  })
})

export const processPhotoReminders = Effect.fn(
  'engagement-scheduler.photoReminders'
)(function* (usersWithTips: ReadonlyArray<UserWithSettings>) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  yield* processUsers({
    schedulerName: SCHEDULER_NAME,
    notificationType: 'photo_reminder',
    users: usersWithTips,
    processUser: (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)

        const stalePlants = yield* engagementRepo.getPlantsWithoutRecentPhoto(
          user.id,
          daysAgoAsDate(PHOTO_STALENESS_DAYS)
        )

        if (Array.isEmptyReadonlyArray(stalePlants)) {
          return yield* new SkipUserError({ reason: 'no_stale_plants' })
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

        yield* Effect.forEach(stalePlants, (plant) =>
          Effect.gen(function* () {
            const alreadySent =
              yield* engagementRepo.hasNotificationForPlantInPeriod(
                user.id,
                'photo_reminder',
                plant.plantId,
                daysAgoAsDate(PHOTO_DEDUP_DAYS)
              )
            if (alreadySent) return

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
          })
        )
      }),
  })
})

export const processPlantParentMilestones = Effect.fn(
  'engagement-scheduler.milestones'
)(function* (usersWithTips: ReadonlyArray<UserWithSettings>) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  yield* processUsers({
    schedulerName: SCHEDULER_NAME,
    notificationType: 'milestone',
    users: usersWithTips,
    processUser: (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)
        const daysSinceJoin = daysSince(user.createdAt)

        const milestone = yield* pipe(
          Array.findFirst(MILESTONES, (m) => m === daysSinceJoin),
          Option.match({
            onNone: () => new SkipUserError({ reason: 'no_milestone' }),
            onSome: Effect.succeed,
          })
        )

        // Use a long lookback (milestone value + 1 day) to prevent re-sends
        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'plant_parent_milestone',
          daysAgoAsDate(milestone + 1)
        )
        if (alreadySent) {
          return yield* new SkipUserError({ reason: 'already_sent' })
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
      }),
  })
})

export const processStreakAtRisk = Effect.fn(
  'engagement-scheduler.streakAtRisk'
)(function* (
  usersWithCareReminders: ReadonlyArray<UserWithSettings>,
  streakMap: ReadonlyMap<string, number>
) {
  const careLogRepo = yield* CareLogRepository
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  yield* processUsers({
    schedulerName: SCHEDULER_NAME,
    notificationType: 'streak_at_risk',
    users: usersWithCareReminders,
    processUser: (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)

        const streak = pipe(
          Option.fromNullable(streakMap.get(user.id)),
          Option.getOrElse(() => 0)
        )
        if (streak < STREAK_AT_RISK_MIN) {
          return yield* new SkipUserError({ reason: 'streak_too_short' })
        }

        const localNow = withTimeZone(DateTime.unsafeNow(), timezone)
        const { hours } = DateTime.toParts(localNow)
        if (hours < STREAK_AT_RISK_HOUR) {
          return yield* new SkipUserError({ reason: 'before_6pm' })
        }

        const alreadySent =
          yield* notificationRepo.hasNotificationOfTypeTodayForUser(
            user.id,
            timezone,
            'streak_at_risk'
          )
        if (alreadySent) {
          return yield* new SkipUserError({ reason: 'already_sent' })
        }

        const todayCount = yield* careLogRepo.countTodayByUser(
          user.id,
          timezone
        )
        if (todayCount > 0) {
          return yield* new SkipUserError({ reason: 'care_done_today' })
        }

        const plantNames = yield* engagementRepo.getPlantNamesForUser(user.id)

        const randomValue = yield* Random.next
        const scheduledAt = yield* pickNotificationTime(
          user.id,
          timezone,
          user.doNotDisturb,
          user.doNotDisturbStart,
          user.doNotDisturbEnd,
          randomValue
        )

        const params = pipe(
          Array.head(plantNames),
          Option.match({
            onNone: () => ({ streakCount: streak }),
            onSome: (name) => ({ streakCount: streak, plantName: name }),
          })
        )

        const { title, body } = buildSimpleContent(
          'streak_at_risk',
          params,
          user.language
        )

        yield* notificationRepo.create({
          type: 'streak_at_risk',
          title,
          body,
          scheduledAt,
          userId: user.id,
        })
      }),
  })
})

export const processStreakMilestones = Effect.fn(
  'engagement-scheduler.streakMilestones'
)(function* (
  usersWithCareReminders: ReadonlyArray<UserWithSettings>,
  streakMap: ReadonlyMap<string, number>
) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  yield* processUsers({
    schedulerName: SCHEDULER_NAME,
    notificationType: 'streak_milestone',
    users: usersWithCareReminders,
    processUser: (user) =>
      Effect.gen(function* () {
        const timezone = resolveTimezone(user.timezone)

        const streak = pipe(
          Option.fromNullable(streakMap.get(user.id)),
          Option.getOrElse(() => 0)
        )

        yield* pipe(
          Array.findFirst(STREAK_MILESTONES, (m) => m === streak),
          Option.match({
            onNone: () => new SkipUserError({ reason: 'no_milestone' }),
            onSome: Effect.succeed,
          })
        )

        const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
          user.id,
          'streak_milestone',
          daysAgoAsDate(streak + 1)
        )
        if (alreadySent) {
          return yield* new SkipUserError({ reason: 'already_sent' })
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
          'streak_milestone',
          { streakCount: streak },
          user.language
        )

        yield* notificationRepo.create({
          type: 'streak_milestone',
          title,
          body,
          scheduledAt,
          userId: user.id,
        })
      }),
  })
})

const processTrialEndingForThreshold = (
  daysLeft: number,
  engagementRepo: EngagementRepository['Type'],
  notificationRepo: NotificationRepository['Type']
) =>
  Effect.gen(function* () {
    const trialingUsers =
      yield* engagementRepo.getTrialingUsersWithTrialEndingSoon(daysLeft)

    yield* processUsers({
      schedulerName: SCHEDULER_NAME,
      notificationType: 'trial_ending',
      users: trialingUsers,
      processUser: (user) =>
        Effect.gen(function* () {
          const timezone = resolveTimezone(user.timezone)

          const alreadySent = yield* engagementRepo.hasNotificationInPeriod(
            user.id,
            'trial_ending',
            daysAgoAsDate(daysLeft + 1)
          )
          if (alreadySent) {
            return yield* new SkipUserError({ reason: 'already_sent' })
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
            'trial_ending',
            { trialDaysLeft: daysLeft },
            user.language
          )

          yield* notificationRepo.create({
            type: 'trial_ending',
            title,
            body,
            scheduledAt,
            userId: user.id,
          })
        }),
    })
  })

export const processTrialEnding = Effect.fn('engagement-scheduler.trialEnding')(
  function* () {
    const engagementRepo = yield* EngagementRepository
    const notificationRepo = yield* NotificationRepository

    yield* Effect.all(
      Array.map(TRIAL_ENDING_DAYS, (daysLeft) =>
        processTrialEndingForThreshold(
          daysLeft,
          engagementRepo,
          notificationRepo
        )
      )
    )
  }
)

export const processPlantAnniversaries = Effect.fn(
  'engagement-scheduler.plantAnniversaries'
)(function* (usersWithCareReminders: ReadonlyArray<UserWithSettings>) {
  const engagementRepo = yield* EngagementRepository
  const notificationRepo = yield* NotificationRepository

  const anniversaryPlants =
    yield* engagementRepo.getPlantsWithAnniversary(ANNIVERSARY_MONTHS)

  if (Array.isEmptyReadonlyArray(anniversaryPlants)) return

  const userMap = new Map(
    Array.map(usersWithCareReminders, (u) => [u.id, u] as const)
  )

  // Group plants by user so every plant for the same user shares ONE
  // scheduledAt. Otherwise each plant picks its own random time and the
  // notification scheduler picks them up across different polls, producing
  // one push per plant instead of a single grouped push.
  const userGroups = pipe(
    Record.toEntries(Array.groupBy(anniversaryPlants, (p) => p.userId)),
    Array.map(([userId, plants]) => ({ id: userId, userId, plants }))
  )

  yield* processUsers({
    schedulerName: SCHEDULER_NAME,
    notificationType: 'plant_anniversary',
    users: userGroups,
    processUser: (group) =>
      Effect.gen(function* () {
        const user = userMap.get(group.userId)
        if (!user) {
          return yield* new SkipUserError({
            reason: 'care_reminders_disabled',
          })
        }

        const timezone = resolveTimezone(user.timezone)

        // One scheduledAt shared across all plants for this user in this run.
        const randomValue = yield* Random.next
        const scheduledAt = yield* pickNotificationTime(
          user.id,
          timezone,
          user.doNotDisturb,
          user.doNotDisturbStart,
          user.doNotDisturbEnd,
          randomValue
        )

        const createdForUser = yield* Ref.make(0)

        yield* Effect.forEach(group.plants, (plant) =>
          Effect.gen(function* () {
            const alreadySent =
              yield* engagementRepo.hasNotificationForPlantInPeriod(
                user.id,
                'plant_anniversary',
                plant.plantId,
                daysAgoAsDate(32)
              )
            if (alreadySent) return

            const monthsSinceAdded = Math.round(
              daysSince(plant.dateAdded) / 30.44
            )
            const years = Math.floor(monthsSinceAdded / 12)
            const anniversaryDuration =
              monthsSinceAdded >= 12
                ? `${years} year${years > 1 ? 's' : ''}`
                : `${monthsSinceAdded} month${monthsSinceAdded > 1 ? 's' : ''}`

            const dateAddedStr = new Intl.DateTimeFormat(user.language, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(plant.dateAdded)

            const { title, body } = buildSimpleContent(
              'plant_anniversary',
              {
                plantName: plant.plantName,
                anniversaryDuration,
                dateAdded: dateAddedStr,
              },
              user.language
            )

            yield* notificationRepo.create({
              type: 'plant_anniversary',
              title,
              body,
              scheduledAt,
              userId: user.id,
              plantId: plant.plantId,
            })

            yield* Ref.update(createdForUser, (n) => n + 1)
          })
        )

        const createdCount = yield* Ref.get(createdForUser)
        if (createdCount === 0) {
          return yield* new SkipUserError({ reason: 'already_sent' })
        }
      }),
  })
})

export const checkAndCreateEngagementNotifications = Effect.gen(function* () {
  yield* Effect.log('Running engagement notification check...')

  const engagementRepo = yield* EngagementRepository

  const [usersWithTips, usersWithCareReminders] = yield* Effect.all([
    engagementRepo.getUsersWithTipsEnabled(),
    engagementRepo.getUsersWithCareRemindersEnabled(),
  ])

  if (!Array.isEmptyReadonlyArray(usersWithTips)) {
    yield* Effect.all([
      processInactivityNudges(usersWithTips),
      processPhotoReminders(usersWithTips),
      processPlantParentMilestones(usersWithTips),
    ])
  }

  if (!Array.isEmptyReadonlyArray(usersWithCareReminders)) {
    const achievementRepo = yield* AchievementRepository
    const streakMap = yield* achievementRepo.getBatchCareStreaks(
      Array.map(usersWithCareReminders, (u) => u.id)
    )

    yield* Effect.all([
      processStreakAtRisk(usersWithCareReminders, streakMap),
      processStreakMilestones(usersWithCareReminders, streakMap),
      processPlantAnniversaries(usersWithCareReminders),
    ])
  }

  yield* processTrialEnding()
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
