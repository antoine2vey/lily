import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useCarePlant() {
  const queryClient = useQueryClient()
  return useEffectMutation('plants', 'carePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.plants.all,
        refetchType: 'all',
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.careTasks.all,
        refetchType: 'all',
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.careLogs.all,
        refetchType: 'all',
      })
    },
  })
}
