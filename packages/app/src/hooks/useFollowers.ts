import { useEffectQuery } from '@/utils/client'

export function useFollowers(userId?: string) {
  const ownFollowers = useEffectQuery(
    'social',
    'getFollowers',
    { query: { page: '1', limit: '20' } },
    { enabled: !userId }
  )

  const userFollowers = useEffectQuery(
    'social',
    'getUserFollowers',
    { params: { userId: userId ?? '' }, query: { page: '1', limit: '20' } },
    { enabled: !!userId }
  )

  return userId ? userFollowers : ownFollowers
}
