import { StaleTime } from '@lily/shared'
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
      staleTime: StaleTime.default,
    }
  )
}
