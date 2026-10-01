import { StaleTime } from '@lily/shared'
import { useEffectQuery } from '@/utils/client'

export function usePlant(plantId: string) {
  return useEffectQuery(
    'plants',
    'getPlant',
    {
      params: { id: plantId },
    },
    {
      enabled: !!plantId,
      staleTime: StaleTime.default,
    }
  )
}
