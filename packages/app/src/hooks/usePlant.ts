import { useEffectQuery } from '@/utils/client'

export function usePlant(plantId: string) {
  return useEffectQuery(
    'plants',
    'getPlant',
    {
      path: { id: plantId },
    },
    {
      enabled: !!plantId,
      staleTime: 1000 * 60 * 5, // 5 minutes
    }
  )
}
