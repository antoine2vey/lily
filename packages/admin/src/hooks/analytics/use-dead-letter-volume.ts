import type { DeadLetterVolumeResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import {
  resolvePresetRange,
  useAnalyticsFilters,
} from './use-analytics-filters'

export const useDeadLetterVolume = () => {
  const { preset } = useAnalyticsFilters()
  return useQuery({
    queryKey: ['analytics', 'dead-letter-volume', preset],
    queryFn: () => {
      const { from, to } = resolvePresetRange(preset)
      return apiRequest<DeadLetterVolumeResponse>(
        `/api/admin/analytics/dead-letter-volume?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}
