import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'

export function useFertilizePlant() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'fertilizePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}
