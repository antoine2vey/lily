import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings, UserSettingsUpdateRequest } from '@lily/shared/user'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

// Update user settings (profile + notification preferences)
export const updateUserSettings = (
  id: string,
  data: UserSettingsUpdateRequest
): Effect.Effect<
  UserSettings,
  SqlError | UserNotFoundError,
  PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    // Update user profile fields (name, image)
    const updateData: { name?: string; image?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.image !== undefined) updateData.image = data.image

    const [user] = yield* db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning()

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    // For now, we'll use default notification settings since they're not in the database
    // In a real app, these would be stored and updated in the database
    const notifications = data.notifications
      ? {
          soilAlerts: data.notifications.soilAlerts ?? true,
          wateringReminders: data.notifications.wateringReminders ?? true,
          ads: data.notifications.ads ?? false,
        }
      : {
          soilAlerts: true,
          wateringReminders: true,
          ads: false,
        }

    return {
      name: user.name,
      email: user.email,
      image: user.image || undefined,
      bio: data.bio, // Pass through the bio from request since it's not stored yet
      notifications,
    }
  })
