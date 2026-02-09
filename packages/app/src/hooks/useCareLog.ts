import { StaleTime } from '@lily/shared'
import { useEffectQuery } from 'src/utils/client'

interface UseCareLogParams {
  plantId: string
  logId: string
}

/**
 * Hook to fetch a single care log by ID
 */
export function useCareLog({ plantId, logId }: UseCareLogParams) {
  return useEffectQuery(
    'careLogs',
    'getCareLog',
    {
      path: { plantId, logId },
    },
    {
      enabled: !!plantId && !!logId,
      staleTime: StaleTime.default,
    }
  )
}
