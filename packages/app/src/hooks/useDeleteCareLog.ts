import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

/**
 * Hook to delete a care log
 */
export function useDeleteCareLog() {
  const queryClient = useQueryClient()

  return useEffectMutation('careLogs', 'deleteCareLog', {
    onSuccess: () => {
      // Invalidate care logs queries
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      // Invalidate plants list (may update dates)
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      // Invalidate care tasks
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    },
  })
}
