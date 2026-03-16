import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { achievementEvents } from '@lily/api/services/achievements/endpoints/achievement-events'
import { getUserAchievements } from '@lily/api/services/achievements/endpoints/get-user-achievements'
import { unlockAchievement } from '@lily/api/services/achievements/endpoints/unlock-achievement'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'

export const AchievementsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'achievements', (handlers) =>
    handlers
      .handle('getUserAchievements', () =>
        getUserAchievements().pipe(withInfraErrorsAsDefect)
      )
      .handle('achievementEvents', () =>
        achievementEvents().pipe(withInfraErrorsAsDefect)
      )
      .handle('unlockAchievement', ({ payload }) =>
        unlockAchievement(payload).pipe(withInfraErrorsAsDefect)
      )
  )
