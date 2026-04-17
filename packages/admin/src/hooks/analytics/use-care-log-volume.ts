import type { CareLogVolumeByTypeResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import {
  resolvePresetRange,
  useAnalyticsFilters,
} from './use-analytics-filters'

export const useCareLogVolumeByType = () => {
  const { preset } = useAnalyticsFilters()
  return useQuery({
    queryKey: ['analytics', 'care-log-volume', preset],
    queryFn: () => {
      const { from, to } = resolvePresetRange(preset)
      return apiRequest<CareLogVolumeByTypeResponse>(
        `/api/admin/analytics/care-log-volume-by-type?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}
