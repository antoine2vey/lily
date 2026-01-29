import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export function useDeletePlant() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'deletePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
    },
  })
}
