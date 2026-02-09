import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

/**
 * Hook to update an existing care log
 */
export function useUpdateCareLog() {
  const queryClient = useQueryClient()

  return useEffectMutation('careLogs', 'updateCareLog', {
    onSuccess: () => {
      // Invalidate care logs queries
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      // Invalidate plants list (may update dates)
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
    },
  })
}
