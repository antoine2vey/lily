import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings } from '@lily/shared/user'
import { Effect } from 'effect'

// Get user settings (profile + notification preferences)
export const getUserSettings = (
  id: string
): Effect.Effect<UserSettings, DatabaseError | UserNotFoundError, Database> =>
  Effect.gen(function* () {
    const db = yield* Database

    const user = yield* Effect.tryPromise({
      try: () =>
        db.client.user.findUnique({
          where: { id },
        }),
      catch: () => new DatabaseError(),
    })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    // Transform database user to UserSettings format
    // Using default notification settings since they're not in the database yet
    return {
      name: user.name,
      email: user.email,
      image: user.image || undefined,
      bio: undefined, // Not implemented in database yet
      notifications: {
        soilAlerts: true, // Default values
        wateringReminders: true,
        ads: false,
      },
    }
  })
