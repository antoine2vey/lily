import type { SqlError } from '@effect/sql/SqlError'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import type { Achievement, UnlockAchievementRequest } from '@lily/shared'
import { ACHIEVEMENTS } from '@lily/shared'
import { DatabaseError } from '@lily/shared/errors/database'
import { Effect } from 'effect'

// Unlock achievement
export const unlockAchievement = (
  userId: string,
  request: UnlockAchievementRequest
): Effect.Effect<
  Achievement,
  SqlError | DatabaseError,
  AchievementRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository
    const unlocked = yield* repo.unlock(userId, request.achievement)

    if (!unlocked) {
      // Achievement already exists - fetch and return it
      const existing = yield* repo.findByUserId(userId)
      const found = existing.find((a) => a.achievement === request.achievement)

      if (!found) {
        return yield* Effect.fail(new DatabaseError())
      }

      return {
        id: found.id,
        key: found.achievement,
        name: ACHIEVEMENTS[found.achievement].name,
        description: ACHIEVEMENTS[found.achievement].description,
        iconUrl: ACHIEVEMENTS[found.achievement].iconUrl,
        unlockedAt: found.unlockedAt,
        userId,
      }
    }

    return {
      id: unlocked.id,
      key: unlocked.achievement,
      name: ACHIEVEMENTS[unlocked.achievement].name,
      description: ACHIEVEMENTS[unlocked.achievement].description,
      iconUrl: ACHIEVEMENTS[unlocked.achievement].iconUrl,
      unlockedAt: unlocked.unlockedAt,
      userId,
    }
  })
