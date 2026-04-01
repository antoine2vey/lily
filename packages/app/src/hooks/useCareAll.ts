import type { CareTasksResponse } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Array } from 'effect'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

function optimisticRemoveTasks(
  queryClient: ReturnType<typeof useQueryClient>,
  plantIds: readonly string[],
  careType: string
) {
  const previous = queryClient.getQueryData<CareTasksResponse>(
    queryKeys.careTasks.list()
  )
  if (!previous) return

  const ids = new Set(plantIds)
  const isMatch = (t: { type: string; plantId: string }) =>
    t.type === careType && ids.has(t.plantId)

  const removedCount =
    Array.length(Array.filter(previous.overdue, isMatch)) +
    Array.length(Array.filter(previous.today, isMatch))

  queryClient.setQueryData<CareTasksResponse>(queryKeys.careTasks.list(), {
    ...previous,
    overdue: Array.filter(previous.overdue, (t) => !isMatch(t)),
    today: Array.filter(previous.today, (t) => !isMatch(t)),
    completedToday: previous.completedToday + removedCount,
  })
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
