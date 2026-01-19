import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  CurrentUser,
  Unauthorized,
} from '@lily/api/services/auth/middleware.types'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings } from '@lily/shared/user'
import { Effect } from 'effect'

// Get user settings (profile + notification preferences)
export const getUserSettings = (
  id: string
): Effect.Effect<
  UserSettings,
  SqlError | UserNotFoundError | Unauthorized,
  UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser

    // Users can only access their own settings
    if (currentUser.id !== id) {
      return yield* Effect.fail(
        new Unauthorized({ message: 'Cannot access other user settings' })
      )
    }

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
        soilAlerts: user.soilAlerts,
        wateringReminders: user.wateringReminders,
        ads: user.ads,
      },
    }
  })
