import type { CareTaskType } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Match, pipe } from 'effect'
import { apiEffectRunner } from '@/utils/client'

interface CompleteTaskParams {
  taskId: string
  plantId: string
  type: CareTaskType
}

async function completeTaskApi(params: CompleteTaskParams): Promise<void> {
  const { plantId, type } = params

  await pipe(
    Match.value(type),
    Match.when('water', async () => {
      await apiEffectRunner('plants', 'waterPlant', {
        path: { id: plantId },
        payload: {},
      })
    }),
    Match.when('fertilize', async () => {
      await apiEffectRunner('plants', 'fertilizePlant', {
        path: { id: plantId },
      })
    }),
    Match.exhaustive
  )
}

export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeTaskApi,
    onSuccess: () => {
      // Invalidate care tasks and plants to refetch
      queryClient.invalidateQueries({ queryKey: ['careTasks'] })
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}
