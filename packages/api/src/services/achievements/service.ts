import { getUserAchievements } from '@lily/api/services/achievements/endpoints/get-user-achievements'
import { unlockAchievement } from '@lily/api/services/achievements/endpoints/unlock-achievement'
import { Effect } from 'effect'

// Achievements service implementation
export class AchievementsService extends Effect.Service<AchievementsService>()(
  'AchievementsService',
  {
    effect: Effect.succeed({
      getUserAchievements,
      unlockAchievement,
    }),
  }
) {}
