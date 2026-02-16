import { StaleTime } from '@lily/shared'
import { useEffectQuery } from 'src/utils/client'

export function useDelegatedTasks() {
  return useEffectQuery(
    'delegations',
    'getDelegatedTasks',
    {},
    {
      staleTime: StaleTime.default,
    }
  )
}
