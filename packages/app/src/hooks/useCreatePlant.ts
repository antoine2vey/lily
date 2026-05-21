import { useQueryClient } from '@tanstack/react-query'
import { Effect } from 'effect'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'
import { recordPositiveMoment } from '@/utils/rating-prompt'

export function useCreatePlant() {
  const queryClient = useQueryClient()
  return useEffectMutation('plants', 'createPlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      Effect.runFork(recordPositiveMoment)
    },
  })
}
