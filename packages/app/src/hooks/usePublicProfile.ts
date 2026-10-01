import { useEffectQuery } from '@/utils/client'

export function usePublicProfile(userId: string) {
  return useEffectQuery(
    'social',
    'getPublicProfile',
    { params: { userId } },
    {
      enabled: !!userId,
    }
  )
}
