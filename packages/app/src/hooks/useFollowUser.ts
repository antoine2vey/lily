import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useFollowUser() {
  const queryClient = useQueryClient()

  return useEffectMutation('social', 'followUser', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all })
    },
  })
}
