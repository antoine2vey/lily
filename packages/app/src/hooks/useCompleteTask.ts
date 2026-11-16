import type { CareType } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Effect } from 'effect'
import { completeCachedCareTasks } from '@/hooks/useCareTasks'
import { apiEffectRunner } from '@/utils/client'
import {
  type CacheSnapshot,
  restoreCachedResults,
} from '@/utils/optimistic-cache'
import { queryKeys } from '@/utils/query-keys'
import { recordPositiveMoment } from '@/utils/rating-prompt'

interface CompleteTaskParams {
  taskId: string
  plantId: string
  type: CareType
}

async function completeTaskApi(params: CompleteTaskParams): Promise<void> {
  const { plantId, type } = params

  await apiEffectRunner('plants', 'carePlant', {
    params: { id: plantId },
    payload: { careType: type },
  })
}

export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeTaskApi,
    onMutate: (params): CacheSnapshot =>
      completeCachedCareTasks(queryClient, (task) => task.id === params.taskId),
    onError: (_err, _params, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSuccess: () => {
      Effect.runFork(recordPositiveMoment)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.achievements.all })
    },
  })
}
