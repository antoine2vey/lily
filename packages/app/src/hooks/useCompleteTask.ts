import type { CareType } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiEffectRunner } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

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
    onSuccess: () => {
      // Invalidate care tasks, plants, care logs, and achievements (streak update)
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.achievements.all })
    },
  })
}
