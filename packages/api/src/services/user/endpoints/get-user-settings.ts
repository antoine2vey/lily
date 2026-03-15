import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings } from '@lily/shared/user'
import { Effect } from 'effect'

// Get user settings (profile + notification preferences)
export const getUserSettings = (): Effect.Effect<
  UserSettings,
  SqlError | UserNotFoundError,
  UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const repo = yield* UserRepository
    const user = yield* repo.findById(id)

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return {
      name: user.name,
      email: user.email,
      image: user.image || undefined,
      bio: user.bio || undefined,
      notifications: {
        careReminders: user.careReminders,
        weeklyDigest: user.weeklyDigest,
        achievements: user.achievementNotifications,
        tips: user.tips,
        productUpdates: user.productUpdates,
        ads: user.ads,
        doNotDisturb: user.doNotDisturb,
        doNotDisturbStart: user.doNotDisturbStart || '22:00',
        doNotDisturbEnd: user.doNotDisturbEnd || '07:00',
      },
      privacy: {
        publicProfile: user.publicProfile,
        shareGrowthData: user.shareGrowthData,
        personalizedTips: user.personalizedTips,
      },
      timezone: user.timezone,
      preferredNotificationTime: user.preferredNotificationTime,
      language: user.language,
      temperatureUnit: user.temperatureUnit,
      weather: {
        enabled: user.weatherEnabled,
        latitude: user.latitude ?? null,
        longitude: user.longitude ?? null,
      },
    }
  }).pipe(Effect.withSpan('UserService.getUserSettings'))
