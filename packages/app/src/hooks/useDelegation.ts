import { StaleTime } from '@lily/shared'
import { useEffectQuery } from 'src/utils/client'

export function useDelegation(delegationId: string) {
  return useEffectQuery(
    'delegations',
    'getDelegation',
    {
      path: { delegationId },
    },
    {
      enabled: !!delegationId,
      staleTime: StaleTime.default,
    }
  )
}
