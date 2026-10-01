import { StaleTime } from '@lily/shared'
import { useEffectQuery } from '@/utils/client'

export function useDelegation(delegationId: string) {
  return useEffectQuery(
    'delegations',
    'getDelegation',
    {
      params: { delegationId },
    },
    {
      enabled: !!delegationId,
      staleTime: StaleTime.default,
    }
  )
}
