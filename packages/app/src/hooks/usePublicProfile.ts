import { useEffectQuery } from 'src/utils/client'

export function usePublicProfile(userId: string) {
  return useEffectQuery(
    'social',
    'getPublicProfile',
    { path: { userId } },
    {
      enabled: !!userId,
    }
  )
}
