import { Option } from 'effect'
import { useFollowers } from '@/hooks/useFollowers'
import { useFollowing } from '@/hooks/useFollowing'

export function useSocialStats() {
  const { data: followers } = useFollowers()
  const { data: following } = useFollowing()

  return {
    followerCount: Option.getOrElse(
      Option.fromNullishOr(followers?.total),
      () => 0
    ),
    followingCount: Option.getOrElse(
      Option.fromNullishOr(following?.total),
      () => 0
    ),
  }
}
