import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useCareAll() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'careMultiplePlants', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.details() })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    },
  })
}
