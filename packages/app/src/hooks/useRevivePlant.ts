import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

/**
 * "Bring back": restores a plant from the cemetery. The API enforces the
 * free-tier plant limit here, so callers must handle `LimitExceededError`.
 */
export function useRevivePlant() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'revivePlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
    },
  })
}
