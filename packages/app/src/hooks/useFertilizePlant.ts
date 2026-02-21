import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useFertilizePlant() {
  const queryClient = useQueryClient()
  return useEffectMutation('plants', 'fertilizePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.details() })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
    },
  })
}
