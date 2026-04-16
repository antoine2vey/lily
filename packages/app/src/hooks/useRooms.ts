import { StaleTime } from '@lily/shared'
import { useEffectQuery } from '@/utils/client'

export function useRooms() {
  return useEffectQuery(
    'rooms',
    'getRooms',
    {},
    { staleTime: StaleTime.default }
  )
}
