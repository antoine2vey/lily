import type { NotificationToCareActionResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import {
  resolvePresetRange,
  useAnalyticsFilters,
} from './use-analytics-filters'

export const useNotificationToCareAction = () => {
  const { preset } = useAnalyticsFilters()
  return useQuery({
    queryKey: ['analytics', 'notification-to-care-action', preset],
    queryFn: () => {
      const { from, to } = resolvePresetRange(preset)
      return apiRequest<NotificationToCareActionResponse>(
        `/api/admin/analytics/notification-to-care-action?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}
