import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

export function useUnfollowUser() {
  const queryClient = useQueryClient()

  return useEffectMutation('social', 'unfollowUser', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all })
    },
  })
}
