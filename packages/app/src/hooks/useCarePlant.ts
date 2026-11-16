import { useQueryClient } from '@tanstack/react-query'
import { completeCachedCareTasks } from '@/hooks/useCareTasks'
import { useEffectMutation } from '@/utils/client'
import {
  type CacheSnapshot,
  restoreCachedResults,
} from '@/utils/optimistic-cache'
import { queryKeys } from '@/utils/query-keys'

export function useCarePlant() {
  const queryClient = useQueryClient()
  return useEffectMutation('plants', 'carePlant', {
    onMutate: ({ params, payload }): CacheSnapshot =>
      // A backdated log may not complete today's task, so only a log for now
      // removes it before the API answers.
      payload.date === undefined
        ? completeCachedCareTasks(
            queryClient,
            (task) =>
              task.plantId === params.id && task.type === payload.careType
          )
        : [],
    onError: (_error, _params, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.plants.all,
        refetchType: 'all',
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.careTasks.all,
        refetchType: 'all',
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.careLogs.all,
        refetchType: 'all',
      })
    },
  })
}
