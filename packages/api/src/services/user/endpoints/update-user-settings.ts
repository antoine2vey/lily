import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  CurrentUser,
  Unauthorized,
} from '@lily/api/services/auth/middleware.types'
import { calculateScheduledAt } from '@lily/api/services/notifications/timezone-scheduler'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings, UserSettingsUpdateRequest } from '@lily/shared/user'
import { Effect, Match, Option, pipe, Record } from 'effect'

// Remove undefined values from an object
const compact = <T extends Record<string, unknown>>(obj: T) =>
  Record.filter(obj, (value) => value !== undefined)

// Update user settings (profile + notification preferences)
export const updateUserSettings = (
  id: string,
  data: UserSettingsUpdateRequest
): Effect.Effect<
  UserSettings,
  SqlError | UserNotFoundError | Unauthorized,
  UserRepository | CurrentUser | NotificationRepository | PlantRepository
> =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser

    // Users can only update their own settings
    if (currentUser.id !== id) {
      return yield* Effect.fail(
        new Unauthorized({ message: 'Cannot modify other user settings' })
      )
    }

    const repo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository
    const plantRepo = yield* PlantRepository

    // Get current user settings to check if timezone/time changed
    const existingUser = yield* repo.findById(id)
    if (!existingUser) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    const updateData = compact({
      name: data.name,
      image: data.image,
      bio: data.bio,
      soilAlerts: data.notifications?.soilAlerts,
      wateringReminders: data.notifications?.wateringReminders,
      ads: data.notifications?.ads,
      timezone: data.timezone,
      preferredNotificationTime: data.preferredNotificationTime,
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

            // Get the plant to find the base date
            const plant = yield* plantRepo.findById(plantId)
            if (!plant) return

            // Determine the base date based on notification type
            const baseDate = pipe(
              Match.value(notification.type),
              Match.when('watering_reminder', () =>
                Option.fromNullable(plant.nextWateringAt)
              ),
              Match.when('fertilization_reminder', () =>
                Option.fromNullable(plant.nextFertilizationAt)
              ),
              Match.orElse(() => Option.none<Date>())
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
      image: user.image || undefined,
      bio: user.bio || undefined,
      notifications: {
        soilAlerts: user.soilAlerts,
        wateringReminders: user.wateringReminders,
        ads: user.ads,
      },
      timezone: user.timezone,
      preferredNotificationTime: user.preferredNotificationTime,
    }
  })
