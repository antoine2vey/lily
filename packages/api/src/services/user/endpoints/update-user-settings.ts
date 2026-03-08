import type { SqlError } from '@effect/sql/SqlError'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { calculateScheduledAt } from '@lily/api/services/notifications/timezone-scheduler'
import { compact } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings, UserSettingsUpdateRequest } from '@lily/shared/user'
import { Array, Effect, Match, Option, pipe } from 'effect'

// Update user settings (profile + notification preferences)
export const updateUserSettings = (
  data: UserSettingsUpdateRequest
): Effect.Effect<
  UserSettings,
  SqlError | UserNotFoundError,
  UserRepository | CurrentUser | NotificationRepository | CareScheduleRepository
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const repo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository
    const scheduleRepo = yield* CareScheduleRepository

    // Get current user settings to check if timezone/time changed
    const existingUser = yield* repo.findById(id)
    if (!existingUser) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    const updateData = compact({
      name: data.name,
      image: data.image,
      bio: data.bio,
      careReminders: data.notifications?.careReminders,
      weeklyDigest: data.notifications?.weeklyDigest,
      achievementNotifications: data.notifications?.achievements,
      tips: data.notifications?.tips,
      productUpdates: data.notifications?.productUpdates,
      ads: data.notifications?.ads,
      doNotDisturb: data.notifications?.doNotDisturb,
      doNotDisturbStart: data.notifications?.doNotDisturbStart,
      doNotDisturbEnd: data.notifications?.doNotDisturbEnd,
      publicProfile: data.privacy?.publicProfile,
      shareGrowthData: data.privacy?.shareGrowthData,
      personalizedTips: data.privacy?.personalizedTips,
      weatherEnabled: data.weather?.enabled,
      latitude: data.weather?.latitude,
      longitude: data.weather?.longitude,
      timezone: data.timezone,
      preferredNotificationTime: data.preferredNotificationTime,
      language: data.language,
    })

    const user = yield* repo.update(id, updateData)

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    // Check if timezone or preferred time changed
    const timezoneChanged =
      data.timezone !== undefined && data.timezone !== existingUser.timezone
    const timeChanged =
      data.preferredNotificationTime !== undefined &&
      data.preferredNotificationTime !== existingUser.preferredNotificationTime

    // Reschedule pending notifications if timezone settings changed
    if (timezoneChanged || timeChanged) {
      const pendingNotifications =
        yield* notificationRepo.findPendingByUserId(id)

      yield* Effect.forEach(
        pendingNotifications,
        (notification) =>
          Effect.gen(function* () {
            // Skip notifications without a plant ID
            const plantId = notification.plantId
            if (!plantId) return

            // Fetch care schedules for the plant
            const schedules = yield* scheduleRepo.findByPlant(plantId)

            // Determine the base date based on notification type
            const careType = pipe(
              Match.value(notification.type),
              Match.when('watering_reminder', () =>
                Option.some('watering' as const)
              ),
              Match.when('fertilization_reminder', () =>
                Option.some('fertilization' as const)
              ),
              Match.orElse(() => Option.none<'watering' | 'fertilization'>())
            )

            const baseDate = pipe(
              careType,
              Option.flatMap((ct) =>
                pipe(
                  Array.findFirst(schedules, (s) => s.careType === ct),
                  Option.flatMap((s) => Option.fromNullable(s.nextCareAt))
                )
              )
            )

            // If we have a base date, recalculate the scheduled time
            if (Option.isSome(baseDate)) {
              const newScheduledAt = yield* calculateScheduledAt(
                baseDate.value,
                user.timezone,
                user.preferredNotificationTime
              )
              yield* notificationRepo.updateScheduledAt(
                notification.id,
                newScheduledAt
              )
            }
          }),
        { concurrency: 10 }
      )
    }

    return {
      name: user.name,
      email: user.email,
      image: pipe(Option.fromNullable(user.image), Option.getOrUndefined),
      bio: pipe(Option.fromNullable(user.bio), Option.getOrUndefined),
      notifications: {
        careReminders: user.careReminders,
        weeklyDigest: user.weeklyDigest,
        achievements: user.achievementNotifications,
        tips: user.tips,
        productUpdates: user.productUpdates,
        ads: user.ads,
        doNotDisturb: user.doNotDisturb,
        doNotDisturbStart: pipe(
          Option.fromNullable(user.doNotDisturbStart),
          Option.getOrElse(() => '22:00')
        ),
        doNotDisturbEnd: pipe(
          Option.fromNullable(user.doNotDisturbEnd),
          Option.getOrElse(() => '07:00')
        ),
      },
      privacy: {
        publicProfile: user.publicProfile,
        shareGrowthData: user.shareGrowthData,
        personalizedTips: user.personalizedTips,
      },
      timezone: user.timezone,
      preferredNotificationTime: user.preferredNotificationTime,
      language: user.language,
      weather: {
        enabled: user.weatherEnabled,
        latitude: pipe(Option.fromNullable(user.latitude), Option.getOrNull),
        longitude: pipe(Option.fromNullable(user.longitude), Option.getOrNull),
      },
    }
  }).pipe(Effect.withSpan('UserService.updateUserSettings'))
