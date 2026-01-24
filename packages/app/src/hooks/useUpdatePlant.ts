import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'

export function useUpdatePlant(_plantId: string) {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'updatePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants', 'getPlant'] })
      queryClient.invalidateQueries({ queryKey: ['plants', 'getPlants'] })
    },
  })
}
