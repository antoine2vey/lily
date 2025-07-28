import { type PrismaError, PrismaService } from '@lily/db'
import type {
  Achievement,
  UnlockAchievementRequest,
} from '@lily/shared/achievement'
import { Effect } from 'effect'

// Unlock achievement
export const unlockAchievement = (
  userId: string,
  request: UnlockAchievementRequest
): Effect.Effect<Achievement, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    // Return fake achievement data
    return {
      id: 'new_ach',
      key: request.achievement,
      name: 'Manual Achievement',
      description: 'This achievement was manually unlocked',
      iconUrl: '/icons/manual-achievement.png',
      unlockedAt: new Date(),
      userId,
    }
  })
