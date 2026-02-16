import { Option } from 'effect'
import { useFollowers } from 'src/hooks/useFollowers'
import { useFollowing } from 'src/hooks/useFollowing'

export function useSocialStats() {
  const { data: followers } = useFollowers()
  const { data: following } = useFollowing()

  return {
    followerCount: Option.getOrElse(
      Option.fromNullable(followers?.total),
      () => 0
    ),
    followingCount: Option.getOrElse(
      Option.fromNullable(following?.total),
      () => 0
    ),
  }
}
