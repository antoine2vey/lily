import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { UserSettings } from '@lily/shared/user'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

// Get user settings (profile + notification preferences)
export const getUserSettings = (
  id: string
): Effect.Effect<
  UserSettings,
  SqlError | UserNotFoundError,
  PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [user] = yield* db.select().from(users).where(eq(users.id, id))

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
