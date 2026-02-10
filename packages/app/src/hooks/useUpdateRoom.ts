import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useUpdateRoom() {
  const queryClient = useQueryClient()

  return useEffectMutation('rooms', 'updateRoom', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all })
    },
  })
}
