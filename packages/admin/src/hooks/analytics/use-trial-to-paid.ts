import { API_PREFIX } from '@lily/shared'
import type { TrialToPaidResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

export const useTrialToPaid = () =>
  useQuery({
    queryKey: queryKeys.analytics.metric('trial-to-paid'),
    queryFn: () =>
      apiRequest<TrialToPaidResponse>(
        `${API_PREFIX}/admin/analytics/trial-to-paid`
      ),
    staleTime: 5 * 60 * 1000,
  })
