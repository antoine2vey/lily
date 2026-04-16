import { StaleTime } from '@lily/shared'
import { useEffectQuery } from '@/utils/client'

export function useSuggestedUsers() {
  return useEffectQuery(
    'social',
    'getSuggestedUsers',
    {},
    {
      staleTime: StaleTime.default,
    }
  )
}
