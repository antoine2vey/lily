import { useQueryClient } from '@tanstack/react-query'
import { completeCachedCareTasks } from '@/hooks/useCareTasks'
import { useEffectMutation } from '@/utils/client'
import {
  type CacheSnapshot,
  restoreCachedResults,
} from '@/utils/optimistic-cache'
import { queryKeys } from '@/utils/query-keys'

export function useCareAll() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'careMultiplePlants', {
    onMutate: ({ payload }): CacheSnapshot => {
      const plantIds = new Set(payload.plantIds)
      return completeCachedCareTasks(
        queryClient,
        (task) => task.type === payload.careType && plantIds.has(task.plantId)
      )
    },
    onError: (_error, _params, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.details() })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    },
  })
}
