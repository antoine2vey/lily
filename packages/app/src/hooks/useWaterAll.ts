import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'

export function useWaterAll() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'waterMultiplePlants', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants', 'getPlant'] })
      queryClient.invalidateQueries({ queryKey: ['plants', 'getPlants'] })
      queryClient.invalidateQueries({ queryKey: ['careLogs'] })
      queryClient.invalidateQueries({ queryKey: ['careTasks'] })
    },
  })
}
