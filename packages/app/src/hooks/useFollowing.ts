import { useEffectQuery } from 'src/utils/client'

export function useFollowing(userId?: string) {
  const ownFollowing = useEffectQuery(
    'social',
    'getFollowing',
    { urlParams: { page: '1', limit: '20' } },
    { enabled: !userId }
  )

  const userFollowing = useEffectQuery(
    'social',
    'getUserFollowing',
    { path: { userId: userId ?? '' }, urlParams: { page: '1', limit: '20' } },
    { enabled: !!userId }
  )

  return userId ? userFollowing : ownFollowing
}
