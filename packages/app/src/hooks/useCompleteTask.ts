import type { CareTasksResponse, CareType } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Array, Effect } from 'effect'
import { apiEffectRunner } from '@/utils/client'
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
    path: { id: plantId },
    payload: { careType: type },
  })
}

export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeTaskApi,
    onMutate: async (params) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.careTasks.list(),
      })
      const previous = queryClient.getQueryData<CareTasksResponse>(
        queryKeys.careTasks.list()
      )
      if (previous) {
        const removeTask = (tasks: CareTasksResponse['overdue']) =>
          Array.filter(tasks, (t) => t.id !== params.taskId)
        queryClient.setQueryData<CareTasksResponse>(
          queryKeys.careTasks.list(),
          {
            ...previous,
            overdue: removeTask(previous.overdue),
            today: removeTask(previous.today),
            completedToday: previous.completedToday + 1,
          }
        )
      }
      return { previous }
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.careTasks.list(), context.previous)
      }
    },
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
