import { useFollowMutation } from 'src/hooks/useFollowMutation'

export function useUnfollowUser() {
  return useFollowMutation('unfollowUser', false)
}
