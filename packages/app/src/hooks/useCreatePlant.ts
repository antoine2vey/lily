import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useCreatePlant() {
  const queryClient = useQueryClient()

  return useEffectMutation('plants', 'createPlant', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
    },
  })
}
