import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export function useCancelDelegation() {
  const queryClient = useQueryClient()

  return useEffectMutation('delegations', 'cancelDelegation', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.delegations.all })
    },
  })
}
