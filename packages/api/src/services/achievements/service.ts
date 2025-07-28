import { Effect } from 'effect'
import { getUserAchievements } from './endpoints/get-user-achievements'
import { unlockAchievement } from './endpoints/unlock-achievement'

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
