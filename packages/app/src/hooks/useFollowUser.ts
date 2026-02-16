import { useFollowMutation } from 'src/hooks/useFollowMutation'

export function useFollowUser() {
  return useFollowMutation('followUser', true)
}
