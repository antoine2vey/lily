import { useEffectQuery } from '@/utils/client'

export function useAchievements() {
  return useEffectQuery('achievements', 'getUserAchievements', {})
}
