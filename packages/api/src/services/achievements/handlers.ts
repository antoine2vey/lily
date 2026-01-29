import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { AchievementsService } from '@lily/api/services/achievements/service'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withSqlErrorAsDefect } from '@lily/api/services/helpers/sql-error'
import { Effect, Layer } from 'effect'

// Implement the Achievements API group
export const AchievementsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'achievements', (handlers) =>
    Effect.gen(function* () {
      const achievementsService = yield* AchievementsService

      return handlers
        .handle('getUserAchievements', () =>
          achievementsService.getUserAchievements().pipe(withSqlErrorAsDefect)
        )
        .handle('unlockAchievement', ({ payload }) =>
          achievementsService.unlockAchievement(payload).pipe(withSqlErrorAsDefect)
        )
    })
  ).pipe(
    Layer.provide(AchievementsService.Default),
    Layer.provide(AchievementRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
