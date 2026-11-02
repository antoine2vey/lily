import { StaleTime } from '@lily/shared'
import { useEffectQuery } from '@/utils/client'

export function useRooms() {
  return useEffectQuery(
    'rooms',
    'getRooms',
    { query: { includeCanopy: 'true' } },
    { staleTime: StaleTime.default }
  )
}
