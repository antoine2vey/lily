import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export function useUpdatePlant(_plantId: string) {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'updatePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.details() })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
    },
  })
}
