import { useQueryClient } from '@tanstack/react-query'
import { refreshOwnedData, useCanopyMutation } from '@/hooks/useCanopyMutations'
import { apiEffectRunner } from '@/utils/client'
import { plantDetailKey } from '@/utils/plant-cache'
import { queryKeys } from '@/utils/query-keys'

// Each action is one server call. Moving a plant clears its room on the API
// side, so no second request can fail after the move succeeded.

export function useSharePlantWithCanopy() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (plantId: string) =>
      apiEffectRunner('plants', 'sharePlantWithCanopy', {
        params: { id: plantId },
        payload: {},
      }),
    onSuccess: () => refreshOwnedData(queryClient),
  })
}

export function useUnsharePlant() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: (plantId: string) =>
      apiEffectRunner('plants', 'unsharePlant', {
        params: { id: plantId },
        payload: {},
      }),
    onSuccess: () => refreshOwnedData(queryClient),
  })
}

// Muting only changes the caller's reminders: their care tasks and the
// plant's own muted flag.
export function useSetPlantMuted() {
  const queryClient = useQueryClient()
  return useCanopyMutation({
    mutationFn: ({ plantId, muted }: { plantId: string; muted: boolean }) =>
      muted
        ? apiEffectRunner('plants', 'mutePlant', { params: { id: plantId } })
        : apiEffectRunner('plants', 'unmutePlant', { params: { id: plantId } }),
    onSuccess: (_, { plantId }) => {
      queryClient.invalidateQueries({ queryKey: plantDetailKey(plantId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    },
  })
}
