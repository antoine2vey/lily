import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

/**
 * Hook to delete a plant photo
 */
export function useDeletePhoto() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'deletePlantPhoto', {
    onSuccess: () => {
      // Invalidate plant photos and details
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.details() })
    },
  })
}
