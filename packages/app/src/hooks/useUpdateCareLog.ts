import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'

/**
 * Hook to update an existing care log
 */
export function useUpdateCareLog() {
  const queryClient = useQueryClient()

  return useEffectMutation('careLogs', 'updateCareLog', {
    onSuccess: () => {
      // Invalidate care logs queries
      queryClient.invalidateQueries({ queryKey: ['careLogs'] })
      // Invalidate plants list (may update dates)
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}
