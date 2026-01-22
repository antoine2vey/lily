import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'

export function useDeletePlant() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'deletePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants', 'getPlants'] })
    },
  })
}
