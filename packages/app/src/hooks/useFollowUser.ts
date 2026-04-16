import { useFollowMutation } from '@/hooks/useFollowMutation'

export function useFollowUser() {
  return useFollowMutation('followUser', true)
}
