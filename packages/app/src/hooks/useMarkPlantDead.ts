import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

/** "Say goodbye": moves a plant to the cemetery. Owner only. */
export function useMarkPlantDead() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'markPlantDead', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
    },
  })
}
