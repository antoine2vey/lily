import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { AchievementsService } from '@lily/api/services/achievements/service'
import { AuthenticationLive } from '@lily/api/services/auth/middleware'
import { Effect, Layer } from 'effect'

// Implement the Achievements API group
export const AchievementsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'achievements', (handlers) =>
    Effect.gen(function* () {
      const achievementsService = yield* AchievementsService

      return handlers
        .handle('getUserAchievements', ({ path: { userId } }) =>
          achievementsService.getUserAchievements(userId)
        )
        .handle('unlockAchievement', ({ path: { userId }, payload }) =>
          achievementsService.unlockAchievement(userId, payload)
        )
    })
  ).pipe(
    Layer.provide(AchievementsService.Default),
    Layer.provide(AchievementRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
