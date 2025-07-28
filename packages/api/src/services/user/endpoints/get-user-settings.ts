import { type PrismaError, PrismaService } from '@lily/db'
import type { UserSettings } from '@lily/shared/user'
import { Effect } from 'effect'

// Get user settings (profile + notification preferences)
export const getUserSettings = (
  id: string
): Effect.Effect<UserSettings, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const user = yield* prisma.user.findUniqueOrThrow({
      where: { id },
    })

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
