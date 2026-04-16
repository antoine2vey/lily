import { useFollowMutation } from '@/hooks/useFollowMutation'

export function useUnfollowUser() {
  return useFollowMutation('unfollowUser', false)
}
