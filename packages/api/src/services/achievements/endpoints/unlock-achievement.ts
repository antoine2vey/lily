import type { SqlError } from '@effect/sql/SqlError'
import { EntityMutationDefect } from '@lily/api/errors/defects'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { Achievement, UnlockAchievementRequest } from '@lily/shared'
import { ACHIEVEMENTS } from '@lily/shared'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Array, Effect, Option } from 'effect'

// Unlock achievement - restricted to admin users only
export const unlockAchievement = (
  request: UnlockAchievementRequest
): Effect.Effect<
  Achievement,
  SqlError | ForbiddenError,
  AchievementRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser
    const { id: userId } = currentUser

    // Only admins can manually unlock achievements
    if (currentUser.role !== 'admin') {
      return yield* new ForbiddenError({
        message: 'Only admins can manually unlock achievements',
      })
    }
    const repo = yield* AchievementRepository
    const unlocked = yield* repo.unlock(userId, request.achievement)

    if (!unlocked) {
      // Achievement already exists - fetch and return it
      const existing = yield* repo.findByUserId(userId)
      const foundOption = Array.findFirst(
        existing,
        (a) => a.achievement === request.achievement
      )

      return yield* Option.match(foundOption, {
        onNone: () =>
          Effect.die(
            new EntityMutationDefect({
              message: `Achievement ${request.achievement} not found after unlock returned null`,
              entity: 'achievement',
              operation: `unlock(${request.achievement})`,
            })
          ),
        onSome: (found) =>
          Effect.succeed({
            id: found.id,
            key: found.achievement,
            name: ACHIEVEMENTS[found.achievement].name,
            description: ACHIEVEMENTS[found.achievement].description,
            iconUrl: ACHIEVEMENTS[found.achievement].iconUrl,
            unlockedAt: found.unlockedAt,
            userId,
          }),
      })
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
  }).pipe(
    Effect.withSpan('AchievementsService.unlockAchievement', {
      attributes: { 'achievement.key': request.achievement },
    })
  )
