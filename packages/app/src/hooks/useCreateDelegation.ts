import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useCreateDelegation() {
  const queryClient = useQueryClient()

  return useEffectMutation('delegations', 'createDelegation', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.delegations.all })
    },
  })
}
