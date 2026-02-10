import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useDeleteRoom() {
  const queryClient = useQueryClient()

  return useEffectMutation('rooms', 'deleteRoom', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
    },
  })
}
