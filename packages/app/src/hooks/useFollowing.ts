import { useEffectQuery } from '@/utils/client'

export function useFollowing(userId?: string) {
  const ownFollowing = useEffectQuery(
    'social',
    'getFollowing',
    { query: { page: '1', limit: '20' } },
    { enabled: !userId }
  )

  const userFollowing = useEffectQuery(
    'social',
    'getUserFollowing',
    { params: { userId: userId ?? '' }, query: { page: '1', limit: '20' } },
    { enabled: !!userId }
  )

  return userId ? userFollowing : ownFollowing
}
