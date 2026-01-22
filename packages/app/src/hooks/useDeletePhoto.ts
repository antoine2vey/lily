import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'

/**
 * Hook to delete a plant photo
 */
export function useDeletePhoto() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'deletePlantPhoto', {
    onSuccess: () => {
      // Invalidate plant photos
      queryClient.invalidateQueries({
        queryKey: ['plants', 'getPlantPhotos'],
      })
      // Invalidate plant detail (photo count may have changed)
      queryClient.invalidateQueries({
        queryKey: ['plants', 'getPlant'],
      })
    },
  })
}
