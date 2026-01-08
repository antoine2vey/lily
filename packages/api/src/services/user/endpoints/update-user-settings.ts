import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings, UserSettingsUpdateRequest } from '@lily/shared/user'
import { Effect, Record } from 'effect'

// Remove undefined values from an object
const compact = <T extends Record<string, unknown>>(obj: T) =>
  Record.filter(obj, (value) => value !== undefined)

// Update user settings (profile + notification preferences)
export const updateUserSettings = (
  id: string,
  data: UserSettingsUpdateRequest
): Effect.Effect<UserSettings, SqlError | UserNotFoundError, UserRepository> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository

    const updateData = compact({
      name: data.name,
      image: data.image,
      bio: data.bio,
      soilAlerts: data.notifications?.soilAlerts,
      wateringReminders: data.notifications?.wateringReminders,
      ads: data.notifications?.ads,
    })

    const user = yield* repo.update(id, updateData)

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
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
    }
  })
