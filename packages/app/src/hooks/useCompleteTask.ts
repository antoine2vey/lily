import type { CareTasksResponse, CareType } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Array, Effect, Either } from 'effect'
import { type ApiResult, apiEffectRunner } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'
import { recordPositiveMoment } from '@/utils/rating-prompt'

interface CompleteTaskParams {
  taskId: string
  plantId: string
  type: CareType
}

// Must mirror the key produced by `useEffectQuery('careTasks', 'getCareTasks', {})`
// in useCareTasks — INCLUDING the trailing params object. setQueryData/getQueryData
// match exactly, so an off-by-one key (e.g. dropping the `{}`) silently no-ops the
// optimistic update and the list only catches up on the onSettled refetch.
const CARE_TASKS_QUERY_KEY = ['careTasks', 'getCareTasks', {}] as const

interface CompleteTaskContext {
  previous: ApiResult<CareTasksResponse> | undefined
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
    onMutate: async (params): Promise<CompleteTaskContext> => {
      await queryClient.cancelQueries({ queryKey: CARE_TASKS_QUERY_KEY })

      const previous =
        queryClient.getQueryData<ApiResult<CareTasksResponse>>(
          CARE_TASKS_QUERY_KEY
        )

      const removeTask = (tasks: CareTasksResponse['overdue']) =>
        Array.filter(tasks, (t) => t.id !== params.taskId)

      // The cache stores an Either (ApiResult), so map inside the Right to drop
      // the completed task from the overdue/today buckets instantly.
      queryClient.setQueryData<ApiResult<CareTasksResponse>>(
        CARE_TASKS_QUERY_KEY,
        (old) => {
          if (!old) return old
          return Either.map(old, (data) => ({
            ...data,
            overdue: removeTask(data.overdue),
            today: removeTask(data.today),
            completedToday: data.completedToday + 1,
          }))
        }
      )

      return { previous }
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CARE_TASKS_QUERY_KEY, context.previous)
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
