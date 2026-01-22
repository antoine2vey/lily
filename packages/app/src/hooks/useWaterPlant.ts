import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'

export function useWaterPlant() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'waterPlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}
