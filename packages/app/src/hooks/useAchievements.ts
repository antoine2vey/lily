import { useEffectQuery } from 'src/utils/client'

export function useAchievements() {
  return useEffectQuery('achievements', 'getUserAchievements', {})
}
