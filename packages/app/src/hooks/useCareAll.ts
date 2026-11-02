import type { CareTasksResponse } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Array, Result } from 'effect'
import { CARE_TASKS_QUERY_KEY } from '@/hooks/useCareTasks'
import { type ApiResult, useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

function optimisticRemoveTasks(
  queryClient: ReturnType<typeof useQueryClient>,
  plantIds: readonly string[],
  careType: string
) {
  const ids = new Set(plantIds)
  const isMatch = (t: { type: string; plantId: string }) =>
    t.type === careType && ids.has(t.plantId)

  queryClient.setQueryData<ApiResult<CareTasksResponse>>(
    CARE_TASKS_QUERY_KEY,
    (old) =>
      old &&
      Result.map(old, (tasks) => ({
        ...tasks,
        overdue: Array.filter(tasks.overdue, (t) => !isMatch(t)),
        today: Array.filter(tasks.today, (t) => !isMatch(t)),
        completedToday:
          tasks.completedToday +
          Array.length(Array.filter(tasks.overdue, isMatch)) +
          Array.length(Array.filter(tasks.today, isMatch)),
      }))
  )
}

export function useCareAll() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'careMultiplePlants', {
    onMutate: (params) => {
      optimisticRemoveTasks(
        queryClient,
        params.payload.plantIds,
        params.payload.careType
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.details() })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    },
  })
}
