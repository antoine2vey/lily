import type { SqlError } from '@effect/sql/SqlError'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import type { Achievement } from '@lily/shared'
import { ACHIEVEMENTS } from '@lily/shared'
import { Effect } from 'effect'

// Get user achievements
export const getUserAchievements = (
  userId: string
): Effect.Effect<Achievement[], SqlError, AchievementRepository> =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    const unlocked = yield* repo.findByUserId(userId)

    return unlocked.map((ua) => ({
      id: ua.id,
      key: ua.achievement,
      name: ACHIEVEMENTS[ua.achievement].name,
      description: ACHIEVEMENTS[ua.achievement].description,
      iconUrl: ACHIEVEMENTS[ua.achievement].iconUrl,
      unlockedAt: ua.unlockedAt,
      userId,
    }))
  })
