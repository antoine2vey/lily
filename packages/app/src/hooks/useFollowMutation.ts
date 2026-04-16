import { useQueryClient } from '@tanstack/react-query'
import { Either } from 'effect'
import { useEffectMutation } from '@/utils/client'
import {
  optimisticFollowUpdate,
  restoreSocialSnapshot,
  type SocialCacheSnapshot,
  saveSocialSnapshot,
} from '@/utils/optimistic-follow'
import { queryKeys } from '@/utils/query-keys'

interface FollowMutationContext {
  readonly previous: SocialCacheSnapshot
}

function isFollowMutationContext(
  value: unknown
): value is FollowMutationContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    'previous' in value &&
    Array.isArray((value as FollowMutationContext).previous)
  )
}

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
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.social.all })
      const previous = saveSocialSnapshot(queryClient)
      optimisticFollowUpdate(queryClient, variables.path.userId, isFollowing)
      return { previous } satisfies FollowMutationContext
    },
    onSuccess: (data, _variables, context) => {
      if (Either.isLeft(data) && isFollowMutationContext(context)) {
        restoreSocialSnapshot(queryClient, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.social.all,
        refetchType: 'none',
      })
    },
  })
}
