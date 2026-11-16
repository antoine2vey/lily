import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { restoreCachedResults } from '@/utils/optimistic-cache'
import { optimisticFollowUpdate } from '@/utils/optimistic-follow'
import { queryKeys } from '@/utils/query-keys'

/**
 * Shared optimistic mutation for follow/unfollow.
 *
 * Both operations share identical cache logic: snapshot, patch, rollback on
 * API failure, then invalidate. The only differences are the API method name
 * and the target `isFollowing` value.
 */
export function useFollowMutation(
  method: 'followUser' | 'unfollowUser',
  isFollowing: boolean
) {
  const queryClient = useQueryClient()

  return useEffectMutation('social', method, {
    onMutate: (variables) =>
      optimisticFollowUpdate(queryClient, variables.params.userId, isFollowing),
    onError: (_error, _variables, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.social.all,
        refetchType: 'none',
      })
    },
  })
}
