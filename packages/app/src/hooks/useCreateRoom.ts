import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useCreateRoom() {
  const queryClient = useQueryClient()

  return useEffectMutation('rooms', 'createRoom', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all })
    },
  })
}
