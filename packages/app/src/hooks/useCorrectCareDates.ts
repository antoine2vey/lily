import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export function useCorrectCareDates() {
  const queryClient = useQueryClient()
  return useEffectMutation('plants', 'correctCareDates', {
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
